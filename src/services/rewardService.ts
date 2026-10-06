import { FirebaseService } from "./firebaseService";
import { StaffUser, RewardRedemptionResult } from "./types";

export class RewardService {
  static async redeemReward(
    staffClientId: string,
    customerId: string,
    staffUser: StaffUser,
    transactionId?: string
  ): Promise<RewardRedemptionResult> {
    return await FirebaseService.redeemReward(
      staffClientId,
      customerId,
      staffUser,
      transactionId
    );
  }
}
