import type { ComponentProps } from 'react';
import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { Slider as SliderPrimitive } from '@base-ui/react/slider';
import { ChevronDown } from 'lucide-react';

// Module-owned controls: no host aliases, Tailwind classes or app components.
export function Button({
  variant: _variant,
  size: _size,
  ...props
}: ButtonPrimitive.Props & {
  variant?: 'ghost';
  size?: 'icon-lg';
}) {
  return <ButtonPrimitive data-slot="button" {...props} />;
}
export function NativeSelect(props: ComponentProps<'select'>) {
  return (
    <div data-slot="native-select-wrapper">
      <select data-slot="native-select" {...props} />
      <ChevronDown aria-hidden="true" data-slot="native-select-icon" />
    </div>
  );
}
export function NativeSelectOption(props: ComponentProps<'option'>) {
  return <option data-slot="native-select-option" {...props} />;
}
export function Slider({
  value,
  min = 0,
  max = 100,
  ...props
}: SliderPrimitive.Root.Props) {
  return (
    <SliderPrimitive.Root
      data-slot="slider"
      value={value}
      min={min}
      max={max}
      thumbAlignment="edge"
      {...props}
    >
      <SliderPrimitive.Control>
        <SliderPrimitive.Track data-slot="slider-track">
          <SliderPrimitive.Indicator data-slot="slider-range" />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb data-slot="slider-thumb" />
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  );
}
