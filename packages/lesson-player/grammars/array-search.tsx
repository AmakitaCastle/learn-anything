'use client';
import {
  arraySearchModel,
  type ArrayConfig,
  type ArrayState,
  type ArrayPayload,
} from '@learn-anything/lesson-schema';
import type { VisualGrammar } from '../runtime.ts';
import {
  clamp01,
  HandwrittenLine,
  HandDrawnCircle,
  HandDrawnX,
} from '../board/index.tsx';
export const arraySearch: VisualGrammar<ArrayConfig, ArrayState, ArrayPayload> =
  {
    ...arraySearchModel,
    Renderer({ config, state, time }) {
      const ink =
        state.low === null ? 0 : clamp01((time - state.windowAt) / 0.8);
      return (
        <>
          <div
            className={`array-scene focus-${state.focus}`}
            style={
              { '--array-columns': config.values.length } as React.CSSProperties
            }
          >
            {state.focus === 'linear' && (
              <div
                className="linear-scanner"
                style={{
                  left: `${clamp01((time - config.scanStart) / (config.scanEnd - config.scanStart)) * (100 - 100 / config.values.length)}%`,
                  opacity: clamp01((time - config.scanStart) / 0.32),
                }}
              />
            )}
            <div className="pointer-row" aria-hidden="true">
              {config.values.map((_, index) => (
                <div key={index}>
                  {(['low', 'mid', 'high'] as const).map(
                    (name, slot) =>
                      state[name] === index && (
                        <span
                          key={name}
                          className={`pointer ${name}`}
                          style={
                            {
                              '--pointer-ink': clamp01(
                                (time - state.windowAt - slot * 0.18) / 0.45,
                              ),
                            } as React.CSSProperties
                          }
                        >
                          <HandwrittenLine
                            item={{
                              at: state.windowAt + slot * 0.18,
                              id: `${name}-${state.windowAt}`,
                              text: name,
                              tone: 'label',
                            }}
                            time={time}
                          />
                        </span>
                      ),
                  )}
                </div>
              ))}
            </div>
            <div className="number-array">
              {config.values.map((value, index) => {
                const discarded = state.discarded.includes(index),
                  found = state.found === index;
                const appearAt = config.valuesAt + index * config.stagger;
                const appear = clamp01((time - appearAt) / 0.48),
                  discardInk = clamp01((time - state.discardAt) / 0.7);
                return (
                  <div
                    key={index}
                    className={`number-cell${discarded ? ' is-discarded' : ''}`}
                    style={{
                      opacity: appear * (discarded ? 1 - discardInk * 0.72 : 1),
                      clipPath: `inset(0 ${100 - appear * 100}% 0 0)`,
                    }}
                  >
                    <span className="cell-index">{index}</span>
                    <strong>
                      <HandwrittenLine
                        item={{
                          at: appearAt,
                          id: `value-${index}`,
                          text: String(value),
                          tone: 'plain',
                        }}
                        time={time}
                      />
                    </strong>
                    {discarded && <HandDrawnX progress={discardInk} />}
                    {found && (
                      <HandDrawnCircle
                        progress={clamp01((time - state.foundAt) / 0.9)}
                      />
                    )}
                  </div>
                );
              })}
            </div>
            {state.low !== null && (
              <div
                className="range-bracket"
                aria-hidden="true"
                style={{
                  paddingLeft: `${(state.low / config.values.length) * ink * 100}%`,
                  paddingRight: `${((config.values.length - 1 - state.high!) / config.values.length) * ink * 100}%`,
                }}
              >
                <span style={{ '--ink': ink } as React.CSSProperties} />
              </div>
            )}
          </div>
          {state.focus === 'scale' && (
            <div className="halving-trail" aria-label="范围逐步减半">
              {config.trail.map((value, index) => {
                const appear = clamp01(
                  (time - (config.trailAt + index * config.trailStep)) / 0.38,
                );
                return (
                  <span
                    key={index}
                    style={
                      {
                        '--step': index,
                        opacity: appear,
                        clipPath: `inset(0 ${100 - appear * 100}% 0 0)`,
                      } as React.CSSProperties
                    }
                  >
                    {value.toLocaleString('en-US')}
                  </span>
                );
              })}
            </div>
          )}
        </>
      );
    },
  };
