import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';

interface OrderImportResult {
  import_id: number;
  processed_routes: number;
  processed_stores: number;
}

@Injectable({
  providedIn: 'root'
})
export class MigrationService {
  constructor(private supabaseService: SupabaseService) { }
  
  /**
   * Import parsed order data
   * @param parsedData The parsed order data to import
   * @returns A promise that resolves to the import result
   */
  async importParsedOrderData(parsedData: any): Promise<OrderImportResult> {
    try {
      const { data, error } = await this.supabaseService.client.rpc(
        'import_parsed_order_data', 
        { p_parsed_data: parsedData }
      );
      
      if (error) {
        throw error;
      }
      
      return data;
    } catch (error: any) {
      console.error('Error importing parsed order data:', error);
      throw new Error(`Failed to import order data: ${error.message || 'Unknown error'}`);
    }
  }
  
  /**
   * Run a migration to fix the apply_manual_matches function
   * @returns A promise that resolves to the migration result
   */
  async runFixApplyManualMatchesMigration(): Promise<{ success: boolean, message: string }> {
    try {
      const { data, error } = await this.supabaseService.client.rpc('run_fix_apply_manual_matches');
      
      if (error) {
        return {
          success: false,
          message: error.message || 'Unknown error'
        };
      }
      
      return {
        success: true,
        message: data || 'Migration completed successfully'
      };
    } catch (error: any) {
      console.error('Error running migration:', error);
      return {
        success: false,
        message: error.message || 'Unknown error'
      };
    }
  }
} 