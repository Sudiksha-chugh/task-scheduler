import React from 'react';
import Editor from '@monaco-editor/react';
import { Controller } from 'react-hook-form';

export function JsonEditor({ name, control, label, height = 140, error }) {
  return (
    <div>
      {label && (
        <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
          {label}
        </label>
      )}
      <Controller
        name={name}
        control={control}
        render={({ field }) => (
          <div
            className={`rounded-xl overflow-hidden border ${
              error ? 'border-rose-500/50' : 'border-zinc-800'
            }`}
          >
            <Editor
              height={height}
              defaultLanguage="json"
              theme="vs-dark"
              value={field.value}
              onChange={(value) => field.onChange(value ?? '')}
              options={{
                minimap: { enabled: false },
                fontSize: 12,
                lineNumbers: 'off',
                scrollBeyondLastLine: false,
                automaticLayout: true,
                tabSize: 2,
                padding: { top: 12, bottom: 12 },
              }}
            />
          </div>
        )}
      />
      {error && <p className="mt-1.5 text-xs text-rose-400">{error.message}</p>}
    </div>
  );
}
