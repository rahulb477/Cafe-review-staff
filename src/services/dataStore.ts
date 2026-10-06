import { FirebaseService } from "./firebaseService";

export class DataStore {
  static async getClient(slug: string) {
    return await FirebaseService.getClientConfig(slug);
  }
}
