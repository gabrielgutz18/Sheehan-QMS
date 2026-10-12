import { useEffect, useId, useRef, useState } from 'react';

const RED = "#c8202a";
const CHART_HEIGHT = 280;
const MARGIN = { top: 20, right: 44, bottom: 32, left: 44 };
// x-axis labels closer than this would run into each other
const MIN_LABEL_GAP = 64;

const compact = new Intl.NumberFormat(undefined, { notation: "compact" });
const whole = new Intl.NumberFormat();

// round the top of the y-axis up to a clean step: 0 / 5 / 10 / 15 / 20
const niceScale = (max, ticks = 4) => {
    if (max <= 0) return { top: ticks, step: 1 };
    const raw = max / ticks;
    const magnitude = 10 ** Math.floor(Math.log10(raw));
    const n = raw / magnitude;
    const step = Math.max(1, (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * magnitude);
    return { top: Math.ceil(max / step) * step, step };
};

// one red line with a soft red glow; hover or arrow keys show the value at each point
// points: [{ key, label, long, value, detail? }]; value is null for a slot that hasn't come yet
// (later today, later this week), which keeps its place on the axis but gets no line
// unit: what the numbers count, shown in the tooltip ("qty", "served")
export default function LineChart({ points, unit, dimmed, emptyText, label }) {
    const wrapRef = useRef(null);
    const [width, setWidth] = useState(0);
    const [active, setActive] = useState(null);
    const glowId = `glow-${useId().replace(/[^a-zA-Z0-9-]/g, "")}`;

    useEffect(() => {
        const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
        observer.observe(wrapRef.current);
        return () => observer.disconnect();
    }, []);

    const plotW = Math.max(0, width - MARGIN.left - MARGIN.right);
    const plotH = CHART_HEIGHT - MARGIN.top - MARGIN.bottom;
    const baseline = MARGIN.top + plotH;
    // the newest point that has happened; the line, hover and end label stop there
    const last = points.findLastIndex((p) => p.value !== null);
    const shown = points.slice(0, last + 1);
    const { top, step } = niceScale(Math.max(0, ...shown.map((p) => p.value)));
    const x = (i) => MARGIN.left + (points.length > 1 ? (i / (points.length - 1)) * plotW : plotW / 2);
    const y = (v) => MARGIN.top + plotH - (v / top) * plotH;
    const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
    // label every nth slot, counted back from the end so the last one always has a label
    const end = points.length - 1;
    const every = Math.max(1, Math.ceil(points.length / Math.max(1, Math.floor(plotW / MIN_LABEL_GAP))));
    const empty = shown.every((p) => p.value === 0);

    const line = shown.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.value)}`).join(" ");
    const area = `${line} L${x(last)},${baseline} L${x(0)},${baseline} Z`;

    // the crosshair snaps to the nearest point, measured from the plot's left edge
    const pick = (e) => {
        const left = e.currentTarget.ownerSVGElement.getBoundingClientRect().left + MARGIN.left;
        const index = points.length > 1 ? Math.round(((e.clientX - left) / (plotW || 1)) * end) : 0;
        setActive(Math.min(last, Math.max(0, index)));
    };

    const onKeyDown = (e) => {
        const moves = { ArrowLeft: -1, ArrowRight: 1 };
        if (e.key in moves) setActive((i) => Math.min(last, Math.max(0, (i ?? last) + moves[e.key])));
        else if (e.key === "Home") setActive(0);
        else if (e.key === "End") setActive(last);
        else return;
        e.preventDefault();
    };

    const tip = active !== null && last >= 0 && points[active];
    const tipLeft = tip ? Math.min(Math.max(x(active), 70), width - 70) : 0;

    return (
        <div
            ref={wrapRef}
            className={`stats-chart${dimmed ? " is-dimmed" : ""}`}
            tabIndex={0}
            aria-label={`${label}. Use the left and right arrow keys to read each point.`}
            onKeyDown={onKeyDown}
            onFocus={() => last >= 0 && setActive((i) => i ?? last)}
            onBlur={() => setActive(null)}
        >
            {width > 0 && points.length > 0 && (
                <svg width={width} height={CHART_HEIGHT} aria-hidden="true">
                    <defs>
                        <filter id={glowId} x="-5%" y="-40%" width="110%" height="180%">
                            <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor={RED} floodOpacity="0.45" />
                        </filter>
                    </defs>

                    {ticks.map((t) => (
                        <g key={t}>
                            <line className="stats-grid" x1={MARGIN.left} x2={MARGIN.left + plotW} y1={y(t)} y2={y(t)} />
                            <text className="stats-tick" x={MARGIN.left - 8} y={y(t)} dy="0.32em" textAnchor="end">
                                {compact.format(t)}
                            </text>
                        </g>
                    ))}

                    {points.map((p, i) =>
                        (end - i) % every === 0 ? (
                            <text key={p.key} className="stats-tick" x={x(i)} y={baseline + 20} textAnchor="middle">
                                {p.label}
                            </text>
                        ) : null,
                    )}

                    {!empty && (
                        <>
                            <path d={area} fill={RED} fillOpacity="0.1" />
                            <path
                                d={line}
                                fill="none"
                                stroke={RED}
                                strokeWidth="2"
                                strokeLinejoin="round"
                                strokeLinecap="round"
                                filter={`url(#${glowId})`}
                            />
                            {/* the newest value, labelled at the end of the line */}
                            <circle cx={x(last)} cy={y(points[last].value)} r="4" fill={RED} stroke="#ffffff" strokeWidth="2" />
                            <text className="stats-end" x={x(last) + 8} y={y(points[last].value)} dy="0.32em">
                                {compact.format(points[last].value)}
                            </text>
                        </>
                    )}

                    {tip && (
                        <>
                            <line className="stats-crosshair" x1={x(active)} x2={x(active)} y1={MARGIN.top} y2={baseline} />
                            <circle cx={x(active)} cy={y(tip.value)} r="5" fill={RED} stroke="#ffffff" strokeWidth="2" />
                        </>
                    )}

                    {/* hover layer over the whole plot, bigger than the line itself */}
                    <rect
                        x={MARGIN.left - 12}
                        y={MARGIN.top}
                        width={plotW + 24}
                        height={plotH}
                        fill="transparent"
                        onPointerMove={pick}
                        onPointerLeave={() => setActive(null)}
                    />
                </svg>
            )}

            {empty && <p className="stats-empty">{emptyText}</p>}

            {tip && (
                <div className="stats-tooltip" style={{ left: tipLeft, top: y(tip.value) }}>
                    <span className="stats-tooltip-value">
                        <span className="stats-tooltip-key" aria-hidden="true" />
                        {whole.format(tip.value)} {unit}
                    </span>
                    <span className="stats-tooltip-label">{tip.long}{tip.detail && ` · ${tip.detail}`}</span>
                </div>
            )}
        </div>
    );
}
