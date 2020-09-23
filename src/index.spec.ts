import {
  Spotify,
  Rescuetime,
  LastFm,
  PocketCasts,
  Wakatime,
  Clockify,
  GoogleFit,
  OuraRing,
  Goodreads,
  Twitter,
} from "./";

[Spotify, Rescuetime, LastFm, PocketCasts, Wakatime, Clockify, GoogleFit, OuraRing, Goodreads, Twitter].forEach(
  (ClassName) => {
    const className = ClassName.constructor.name;
    describe(`${className} class structure`, () => {
      test(`${className} has an integration name`, () => {
        const testClass = new ClassName();
        expect(testClass.name).toBeDefined();
        expect(typeof testClass.name).toBe("string");
      });
      test(`${className} has an update function`, () => {
        const testClass = new ClassName();
        expect(testClass.update).toBeDefined();
        expect(typeof testClass.update).toBe("function");
      });
    });
  }
);
