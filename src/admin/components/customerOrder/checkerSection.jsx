import checkers, { CHECKER_ROUNDS, breakable } from '../../../data/checkers.js';

// Customer order's Checker tab: a 1st and a 2nd checker for each column (Roofing, Construction, Hardware/TBA/Chassis),
// each one optional; the printed ticket has the same columns, with a blank line wherever a name is left out so it
// can be written in by hand with a ballpen, and sales can still fill them in later with Edit, so they're kept on the
// order for reference
// value: { [column]: [first, second] }, one for every column in src/data/checkers.js
export default function CheckerSection({ value, onChange, maxLength }) {
    const update = (column, round) => (e) =>
        onChange({ ...value, [column]: value[column].map((name, i) => (i === round ? e.target.value : name)) });

    return (
        <div className="checker-section">
            <p className="tab-hint">
                Optional. Anything left blank prints as a line on the ticket, to write the name in by hand.
            </p>
            <div className="checker-columns">
                {checkers.map(({ name: column }) => (
                    <fieldset key={column} className="checker-column">
                        <legend>{breakable(column)}</legend>
                        {CHECKER_ROUNDS.map(({ name: round }, i) => (
                            <input
                                key={round}
                                type="text"
                                autoComplete="off"
                                maxLength={maxLength}
                                placeholder={round}
                                aria-label={`${column} ${round}`}
                                value={value[column][i]}
                                onChange={update(column, i)}
                            />
                        ))}
                    </fieldset>
                ))}
            </div>
        </div>
    );
}
