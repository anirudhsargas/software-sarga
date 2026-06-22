import { memo } from 'react';
import { Monitor, AlertCircle } from 'lucide-react';

const MachineCounterCard = ({ machine, onChange }) => {
    const { id, machine_name, location, opening_count, error, previous_count } = machine;
    const prev = Number(previous_count) || 0;
    const curr = Number(opening_count) || 0;
    const diff = prev > 0 && curr > 0 ? curr - prev : null;
    const isInvalid = prev > 0 && curr > 0 && curr < prev;

    return (
        <div className={`os-machine-card ${error ? 'os-machine-card--error' : ''} ${isInvalid ? 'os-machine-card--invalid' : ''}`}>
            <div className="os-machine-card__header">
                <div className="os-machine-card__icon">
                    <Monitor size={16} />
                </div>
                <div className="os-machine-card__info">
                    <span className="os-machine-card__name">{machine_name}</span>
                    {location && <span className="os-machine-card__location">{location}</span>}
                </div>
            </div>

            <div className="os-machine-card__readings">
                {prev > 0 && (
                    <div className="os-machine-card__prev">
                        <span className="os-machine-card__prev-label">Previous</span>
                        <span className="os-machine-card__prev-value">{prev.toLocaleString('en-IN')}</span>
                    </div>
                )}
                <div className="os-machine-card__input-group">
                    <span className="os-machine-card__input-label">Current</span>
                    <input
                        type="text"
                        inputMode="numeric"
                        className={`os-machine-card__input ${error ? 'os-machine-card__input--error' : ''} ${isInvalid ? 'os-machine-card__input--invalid' : ''}`}
                        value={opening_count}
                        onChange={(e) => {
                            const raw = e.target.value.replace(/[^0-9]/g, '');
                            onChange(id, raw);
                        }}
                        placeholder="Enter reading"
                    />
                </div>
            </div>

            {diff !== null && !isInvalid && (
                <div className="os-machine-card__diff os-machine-card__diff--positive">
                    +{diff.toLocaleString('en-IN')}
                </div>
            )}
            {isInvalid && (
                <div className="os-machine-card__diff os-machine-card__diff--negative">
                    <AlertCircle size={12} /> Cannot be less than previous
                </div>
            )}
            {error && (
                <div className="os-machine-card__error">{error}</div>
            )}
        </div>
    );
};

export default memo(MachineCounterCard);
