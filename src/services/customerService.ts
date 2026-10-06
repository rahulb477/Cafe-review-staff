import { FirebaseService } from "./firebaseService";
import { CustomerProfile } from "./types";

export class CustomerService {
  static async getCustomers(staffClientId: string, query?: string): Promise<CustomerProfile[]> {
    return await FirebaseService.getCustomers(staffClientId, query);
  }

  static async getCustomerById(customerIdOrCode: string, staffClientId: string): Promise<CustomerProfile> {
    return await FirebaseService.getCustomerById(customerIdOrCode, staffClientId);
  }
}
