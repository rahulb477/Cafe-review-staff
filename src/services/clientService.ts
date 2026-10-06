import { FirebaseService } from "./firebaseService";
import { ClientConfig } from "./types";

export class ClientService {
  static async getClientBySlug(slug: string): Promise<ClientConfig> {
    return await FirebaseService.getClientConfig(slug);
  }
}
