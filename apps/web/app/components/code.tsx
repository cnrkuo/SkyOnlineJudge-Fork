import { CODE_MAX_LENGTH, Language, LANGUAGE_LABEL } from '@skyoj/contract';
import type { ChangeEvent } from 'react';
import { useRef } from 'react';

const languages = Object.values(Language);

export function parseLanguage(value: FormDataEntryValue | null): Language {
  return languages.find((language) => language === value) ?? Language.CPP;
}

export function LanguageSelect({ defaultValue = Language.CPP }: { defaultValue?: Language }) {
  return (
    <select className="input w-auto" name="language" defaultValue={defaultValue} aria-label="Language">
      {languages.map((language) => (
        <option key={language} value={language}>
          {LANGUAGE_LABEL[language]}
        </option>
      ))}
    </select>
  );
}

/** Source-code textarea that can also be filled from a local file. */
export function CodeInput({ name = 'code', maxLength = CODE_MAX_LENGTH, rows = 16 }: { name?: string; maxLength?: number; rows?: number }) {
  const area = useRef<HTMLTextAreaElement>(null);
  const loadFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && area.current) area.current.value = await file.text();
    event.target.value = '';
  };
  return (
    <div>
      <textarea
        ref={area}
        className="input code"
        name={name}
        rows={rows}
        maxLength={maxLength}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        aria-label="Source code"
        placeholder="Paste your source code here"
        required
      />
      <label className="hint mt-1 inline-flex cursor-pointer items-center gap-2">
        <span className="text-accent underline">or load it from a file</span>
        <input type="file" className="sr-only" onChange={loadFile} />
      </label>
    </div>
  );
}

/** Read-only source listing with line numbers. */
export function CodeBlock({ code }: { code: string }) {
  const lines = code.replace(/\n$/, '').split('\n');
  return (
    <div className="overflow-x-auto rounded-md border border-line bg-sunken">
      <pre className="code grid min-w-max grid-cols-[auto_1fr] py-2 leading-5">
        {lines.map((line, index) => (
          <span key={index} className="contents">
            <span className="px-3 text-right text-muted select-none">{index + 1}</span>
            <code className="pr-4">{line || ' '}</code>
          </span>
        ))}
      </pre>
    </div>
  );
}
