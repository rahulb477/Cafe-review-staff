import { FirebaseService } from "./firebaseService";
import { StaffUser, StampTransactionResult } from "./types";

export class StampService {
  static async addStamp(
    staffClientId: string,
    customerId: string,
    staffUser: StaffUser,
    transactionId?: string,
    notes?: string
  ): Promise<StampTransactionResult> {
    return await FirebaseService.addStamp(
      staffClientId,
      customerId,
      staffUser,
      transactionId,
      notes
    );
  }
}
