/** Stethoscope Integration */
interface Integration {
  name: string;
  update: () => Promise<void>;
  summary: () => Promise<void>;
  legacy: (date: string | Date) => Promise<void>;
  cli: {
    [index: string]: (...params: any[]) => Promise<void>;
  };
}
