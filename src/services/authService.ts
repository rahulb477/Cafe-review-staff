import { FirebaseService } from "./firebaseService";
import { StaffUser } from "./types";

export class AuthService {
  static async login(email: string, passwordAttempt: string) {
    return await FirebaseService.login(email, passwordAttempt);
  }

  static async logout() {
    return await FirebaseService.logout();
  }

  /**
   * Validates if a staff user is authorized to perform operations on a specific tenant
   */
  static verifyTenantAccess(staffUser: StaffUser | null | undefined, requestedClientSlug: string): boolean {
    if (!staffUser || !staffUser.clientId) return false;
    return staffUser.clientId.toLowerCase() === requestedClientSlug.toLowerCase();
  }
}
