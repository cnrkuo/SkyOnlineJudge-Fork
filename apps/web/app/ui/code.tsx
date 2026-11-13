import { CODE_MAX_LENGTH, LANGUAGE_LABEL, Language } from '@skyoj/contract';
import type { ChangeEvent } from 'react';
import { useRef } from 'react';
import { code as css, css as kit } from './classes';

const languages = Object.values(Language);

/** "C++17 (g++ -std=c++17 -O2)" → "C++17". */
export const languageName = (language: Language) => {
  const [name = language] = LANGUAGE_LABEL[language].split(' (');
  return name;
};

export function parseLanguage(value: FormDataEntryValue | null): Language {
  return languages.find((language) => language === value) ?? Language.CPP;
}

export function LanguageSelect({ defaultValue = Language.CPP }: { defaultValue?: Language }) {
  return (
    <select
      className={`${kit.select} ${kit.inputWidth.auto}`}
      name="language"
      defaultValue={defaultValue}
      aria-label="Language">
      {languages.map((language) => (
        <option key={language} value={language}>
          {LANGUAGE_LABEL[language]}
        </option>
      ))}
    </select>
  );
}

/** Source-code textarea that can also be filled from a local file. */
export function CodeInput({
  name = 'code',
  maxLength = CODE_MAX_LENGTH,
  rows = 16,
}: {
  name?: string;
  maxLength?: number;
  rows?: number;
}) {
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
        className={`${kit.input} ${kit.monoInput}`}
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
      <label className={css.fileLink}>
        or load it from a file
        <input type="file" className={kit.srOnly} onChange={loadFile} />
      </label>
    </div>
  );
}

/**
 * Shows code highlighted on the server by `highlight()` (lib/highlight.server).
 * The HTML comes from Shiki, never from the author directly.
 */
export function CodeView({ html, lineNumbers = true }: { html: string; lineNumbers?: boolean }) {
  return (
    <div className={`${css.code} ${lineNumbers ? css.numbered : ''}`} dangerouslySetInnerHTML={{ __html: html }} />
  );
}
