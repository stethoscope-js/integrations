/** Stethoscope Integration */
export interface Integration {
  /** Slugified name of the integration */
  name: string;

  /** Fetch new data and update */
  update: () => Promise<void>;

  /** Generate data summary for API */
  summary: () => Promise<void>;

  /**
   * @param start - Start date to fetch data from in YYYY-MM-DD format
   */
  legacy: (start: string) => Promise<void>;

  /** CLI methods to export */
  cli: {
    [index: string]: (...params: any[]) => Promise<void>;
  };
}
