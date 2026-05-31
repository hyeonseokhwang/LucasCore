const TERMINAL_PROMPT_SUBMIT_KEY = "\r";

export function normalizePromptForSubmit(value: string) {
  return value.replace(/[\r\n]+$/g, "");
}

export function encodePromptForPtySubmit(value: string) {
  const prompt = normalizePromptForSubmit(value).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return `${prompt}${TERMINAL_PROMPT_SUBMIT_KEY}`;
}

export { TERMINAL_PROMPT_SUBMIT_KEY };
