const start = '2023-07-27';
const end = '2023-10-19';
const dateFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric',
});

function modifiedDuration(yieldPercent) {
  const semiannualYield = yieldPercent / 200;
  let price = 0;
  let weightedTime = 0;
  for (let period = 1; period <= 20; period += 1) {
    const payment = 100 * semiannualYield + (period === 20 ? 100 : 0);
    const presentValue = payment / (1 + semiannualYield) ** period;
    price += presentValue;
    weightedTime += (period / 2) * presentValue;
  }
  return weightedTime / price / (1 + semiannualYield);
}

const basisPoints = (a, b) => Math.round((b - a) * 100);
const signed = value => new Intl.NumberFormat('en-US', {signDisplay: 'exceptZero'}).format(value);
const percent = value => value.toFixed(2) + '%';
const premiumAt = date => treasuryData.event.find(row => row[0] === date)[2];
const mortgageAt = date => treasuryData.mortgage.find(row => row[0] === date)[1];
const comparisons = [
  ['10-year term premium', premiumAt(start), premiumAt(end)],
  ['30-year fixed mortgage rate', mortgageAt(start), mortgageAt(end)],
];
const [premiumChange, mortgageChange] = comparisons.map(([, a, b]) => basisPoints(a, b));

document.querySelector('#claim').textContent =
  `From July 27 to October 19, 2023, the estimated U.S. 10-year term premium rose ${premiumChange} basis points. Over the same dates, the U.S. 30-year fixed mortgage rate rose ${mortgageChange} basis points, from ${percent(mortgageAt(start))} to ${percent(mortgageAt(end))}.`;

for (const [label, a, b] of comparisons) {
  const row = document.querySelector('#endpoints').insertRow();
  const heading = document.createElement('th');
  heading.scope = 'row';
  heading.textContent = label;
  row.append(heading);
  for (const value of [percent(a), percent(b), signed(basisPoints(a, b)) + ' bp']) {
    row.insertCell().textContent = value;
  }
}

function plot(target, points, {title, unit, color, step, ticks, zero = false}) {
  const host = document.querySelector(target);
  const width = Math.round(host.clientWidth);
  const left = 40;
  const right = width - 15;
  const top = 9;
  const bottom = 110;
  const first = Date.parse(points[0][0]);
  const last = Date.parse(points.at(-1)[0]);
  const values = points.map(([, value]) => value);
  const low = Math.floor(Math.min(...values) / step) * step;
  const high = Math.ceil(Math.max(...values) / step) * step;
  const x = time => left + (right - left) * (time - first) / (last - first);
  const y = value => bottom - (bottom - top) * (value - low) / (high - low);
  const coordinates = points.map(([date, value]) => [x(Date.parse(date)), y(value)]);
  const startX = x(Date.parse(start));
  const endX = x(Date.parse(end));
  const band = `<rect class="event" x="${startX}" y="${top}" width="${endX - startX}" height="${bottom - top}"/>`;
  const grid = Array.from({length: Math.round((high - low) / step) + 1}, (_, index) => {
    const value = low + index * step;
    const axisY = y(value);
    return `<line class="grid ${zero && Math.abs(value) < 1e-8 ? 'zero' : ''}" x1="${left}" x2="${right}" y1="${axisY}" y2="${axisY}"/>
      <text x="${left - 7}" y="${axisY + 4}" text-anchor="end">${value.toFixed(1)}</text>`;
  }).join('');
  const dates = ticks.map(([date, label]) =>
    `<text x="${x(Date.parse(date))}" y="129" text-anchor="middle">${label}</text>`).join('');
  const markers = points.flatMap(([date], index) => {
    if (date !== start && date !== end) return [];
    const [cx, cy] = coordinates[index];
    return `<circle cx="${cx}" cy="${cy}" r="3.5" fill="${color}" stroke="var(--paper)" stroke-width="1"/>`;
  }).join('');
  host.innerHTML = `<figure>
    <figcaption style="color:${color}">${title}<small>${unit}</small></figcaption>
    <svg viewBox="0 0 ${width} 139" role="img" aria-label="${title}. Use the arrow keys to inspect observations." tabindex="0">
      ${band}${grid}${dates}
      <polyline points="${coordinates.map(pair => pair.join(',')).join(' ')}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      ${markers}
      <circle class="cursor" r="4" fill="${color}" stroke="var(--paper)" stroke-width="1" visibility="hidden"/>
    </svg>
    <p class="readout" aria-live="polite">Hover over the chart or use the arrow keys to inspect values.</p>
  </figure>`;

  const svg = host.querySelector('svg');
  const cursor = host.querySelector('.cursor');
  const readout = host.querySelector('.readout');
  let selected = -1;
  function inspect(index) {
    selected = index;
    const [date, value] = points[index];
    const [cx, cy] = coordinates[index];
    cursor.setAttribute('cx', cx);
    cursor.setAttribute('cy', cy);
    cursor.setAttribute('visibility', 'visible');
    readout.textContent = `${dateFormat.format(new Date(date))} · ${value.toFixed(2)}${unit === 'Years' ? ' years' : '%'}`;
  }
  svg.addEventListener('pointermove', event => {
    const position = event.clientX - svg.getBoundingClientRect().left;
    const index = coordinates.reduce((best, [cx], current) =>
      Math.abs(cx - position) < Math.abs(coordinates[best][0] - position) ? current : best, 0);
    if (index !== selected) inspect(index);
  });
  svg.addEventListener('keydown', event => {
    const direction = {ArrowLeft: -1, ArrowRight: 1}[event.key];
    if (!direction) return;
    event.preventDefault();
    inspect(Math.min(points.length - 1, Math.max(0, selected + direction)));
  });
}

const historyTicks = [2010, 2013, 2016, 2019, 2022, 2025].map(year => [year + '-07-01', year]);
const eventTicks = [['2023-07-15', 'Jul'], ['2023-08-15', 'Aug'], ['2023-09-15', 'Sep'], ['2023-10-15', 'Oct'], ['2023-11-15', 'Nov']];
let view = 'history';
function renderTreasuries() {
  const rows = treasuryData[view];
  const ticks = view === 'history' ? historyTicks : eventTicks;
  plot('#duration', rows.map(([date, yieldPercent]) => [date, modifiedDuration(yieldPercent)]),
    {title: '10-year Treasury modified duration', unit: 'Years', color: 'var(--plum)', step: .25, ticks});
  plot('#premium', rows.map(([date, , premium]) => [date, premium]),
    {title: '10-year Treasury term premium', unit: 'Percent', color: 'var(--cobalt)', step: .5, ticks, zero: true});
}

const controls = [...document.querySelectorAll('[data-view]')];
for (const button of controls) {
  button.addEventListener('click', () => {
    if (button.dataset.view === view) return;
    view = button.dataset.view;
    controls.forEach(control => control.setAttribute('aria-pressed', control === button));
    document.querySelector('#frequency').textContent = view === 'history'
      ? 'Last shared trading observation each month' : 'Daily Treasury observations, July–November 2023';
    renderTreasuries();
  });
}

function render() {
  renderTreasuries();
  plot('#mortgage', treasuryData.mortgage,
    {title: 'U.S. 30-year fixed mortgage rate', unit: 'Percent', color: 'var(--ochre)', step: .25, ticks: eventTicks});
}
let layoutWidth = 0;
new ResizeObserver(([entry]) => {
  const width = Math.round(entry.contentRect.width);
  if (layoutWidth === width) return;
  layoutWidth = width;
  render();
}).observe(document.querySelector('#duration'));
