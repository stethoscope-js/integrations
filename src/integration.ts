/** Stethoscope Integration */
interface Integration {
  name: string;
  update: () => Promise<void>;
  summary: () => Promise<void>;
}
