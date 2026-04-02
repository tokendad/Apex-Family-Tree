import React from 'react';
import StepDot from '@/components/StepDot/StepDot';
import styles from './StepIndicator.module.css';

export interface StepDef {
  label: string;
}

interface StepIndicatorProps {
  steps: StepDef[];
  currentStep: number; // 1-based
  onStepClick?: (step: number) => void;
  className?: string;
}

const WIZARD_STEPS: StepDef[] = [
  { label: 'Personal Info' },
  { label: 'Vital Events' },
  { label: 'Relationships' },
  { label: 'Media & Notes' },
];

const StepIndicator: React.FC<StepIndicatorProps> = ({
  steps = WIZARD_STEPS,
  currentStep,
  onStepClick,
  className,
}) => {
  const cls = [styles.container, className].filter(Boolean).join(' ');

  return (
    <div className={cls}>
      {steps.map((step, i) => {
        const stepNum = i + 1;
        const status =
          stepNum < currentStep ? 'done' : stepNum === currentStep ? 'current' : 'pending';
        const canClick = status === 'done' && !!onStepClick;

        return (
          <React.Fragment key={i}>
            {i > 0 && (
              <div
                className={[
                  styles.line,
                  stepNum <= currentStep ? styles.lineDone : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              />
            )}
            <div
              className={[styles.stepWrapper, canClick ? styles.clickable : '']
                .filter(Boolean)
                .join(' ')}
              onClick={canClick ? () => onStepClick(stepNum) : undefined}
              role={canClick ? 'button' : undefined}
              tabIndex={canClick ? 0 : undefined}
              onKeyDown={
                canClick
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') onStepClick(stepNum);
                    }
                  : undefined
              }
            >
              <StepDot status={status} step={stepNum} label={step.label} />
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
};

export { WIZARD_STEPS };
export default StepIndicator;
