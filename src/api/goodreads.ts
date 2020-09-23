import { config, cosmicSync } from "@anandchowdhary/cosmic";
import goodreads from "goodreads-api-node";
import type { Integration } from "../integration";
cosmicSync("stethoscope");

const userId = config("goodreadsUserId") || "example";

const api = goodreads(
  {
    key: config("goodreadsKey") || "example",
    secret: config("goodreadsSecret") || "example",
  },
  config("goodreadsCallbackUrl") || "http://localhost:3000/callback"
);

export default class Goodreads implements Integration {
  name = "goodreads";
  cli = {};
  async update() {
    for await (const shelf of (await api.getUserInfo(userId)).user_shelves.user_shelf.map((shelf) => shelf.name)) {
      try {
        const books = await api.getBooksOnUserShelf(userId, shelf);
        console.log(books);
      } catch (error) {
        console.log(error);
      }
    }
  }
  async legacy() {}
  async summary() {}
}
