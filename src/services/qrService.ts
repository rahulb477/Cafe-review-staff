import { FirebaseService } from "./firebaseService";
import { CustomerProfile } from "./types";

export class QRService {
  /**
   * Scans and verifies customer QR with strict tenant isolation check
   */
  static async scanAndResolveCustomer(rawQR: string, staffClientId: string): Promise<CustomerProfile> {
    return await FirebaseService.scanAndResolveCustomer(rawQR, staffClientId);
  }
}
