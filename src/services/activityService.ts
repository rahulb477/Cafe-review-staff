import { FirebaseService } from "./firebaseService";
import { StaffActivityItem } from "./types";
import { Unsubscribe } from "firebase/firestore";

export class ActivityService {
  static listenToRecentActivity(
    staffClientId: string,
    callback: (items: StaffActivityItem[]) => void
  ): Unsubscribe {
    return FirebaseService.listenToRecentActivity(staffClientId, callback);
  }
}
