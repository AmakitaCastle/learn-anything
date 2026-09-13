'use client';
import { useState } from 'react';
import {
  NativeSelect,
  NativeSelectOption,
} from '../components/ui/native-select';
import LessonPlayer from '../app/lesson-player';
import type { LessonSpec } from '@learn-anything/lesson-schema';
export default function ClassroomDemo({
  catalog,
  initial = 'flow',
  choices,
}: {
  catalog: Record<string, LessonSpec>;
  initial?: string;
  choices: { value: string; label: string }[];
}) {
  const [selection, setSelection] = useState(initial);
  return (
    <>
      <div className="example-switch">
        <NativeSelect
          aria-label="示例课程"
          value={selection}
          onChange={(event) => setSelection(event.target.value)}
        >
          {choices.map((choice) => (
            <NativeSelectOption key={choice.value} value={choice.value}>
              {choice.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      <LessonPlayer lesson={catalog[selection]} />
    </>
  );
}
