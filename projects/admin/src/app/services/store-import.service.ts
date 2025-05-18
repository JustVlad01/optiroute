import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class StoreImportService {
  private loadingSubject = new BehaviorSubject<boolean>(false);
  loading$ = this.loadingSubject.asObservable();

  private messageSubject = new BehaviorSubject<{type: 'success' | 'error', text: string} | null>(null);
  message$ = this.messageSubject.asObservable();

  // Basic data storage without matching
  private importedStoresSubject = new BehaviorSubject<any[]>([]);
  importedStores$ = this.importedStoresSubject.asObservable();

  constructor(private supabaseService: SupabaseService) { }

  // Use a simple batch ID generator
  private generateBatchId(): number {
    // Use current timestamp as a simple numeric ID
    return Math.floor(Date.now() / 1000);
  }

  // Import method with reset of existing data and IDs
  async importStores(importData: any): Promise<void> {
    this.loadingSubject.next(true);
    this.messageSubject.next(null);
    this.importedStoresSubject.next([]);
    
    try {
      // Check if there are any pending matches that could cause constraint errors
      const { data: existingMatches, error: matchCheckError } = await this.supabaseService.client
        .from('matched_stores')
        .select('id')
        .limit(1);
        
      if (matchCheckError) {
        console.warn('Error checking for existing matches:', matchCheckError);
        // Continue anyway, the truncate with CASCADE should handle this
      }
      
      // Truncate the table using our safe function
      const { error: truncateError } = await this.supabaseService.client
        .rpc('truncate_excel_import_routes_safe', {});

      if (truncateError) {
        // If there's a foreign key constraint error, provide a more helpful message
        if (truncateError.message.includes('foreign key constraint')) {
          throw new Error('Cannot truncate the existing imported stores due to database constraints. This might be because there are matched stores referring to them. Please try again later or contact support.');
        } else {
          throw new Error(`Error truncating table: ${truncateError.message}`);
        }
      }
      
      // Generate a simple numeric batch ID
      const batchId = this.generateBatchId();
      
      // Process each route
      const allStores = [];
      for (const route of importData) {
        // Process stores in this route
        for (const store of route.stores) {
          // Insert store data
          const { data: importedStore, error: storeError } = await this.supabaseService.client
            .from('excel_import_routes')
            .insert({
              route_name: route.route_name,
              store_name: store.storeName,
              total_quantity: store.totalQuantity,
              crates_needed: store.cratesNeeded,
              import_date: new Date(),
              import_batch_id: batchId
            })
            .select()
            .single();
            
          if (storeError) {
            throw new Error(`Error inserting store: ${storeError.message}`);
          }
          
          if (importedStore) {
            allStores.push(importedStore);
          }
        }
      }
      
      // Update state with imported stores
      this.importedStoresSubject.next(allStores);
      
      // Success message
      this.messageSubject.next({
        type: 'success',
        text: `Successfully imported ${allStores.length} stores`
      });
      
    } catch (error: any) {
      console.error('Error importing stores:', error);
      this.messageSubject.next({
        type: 'error',
        text: `Error importing stores: ${error.message || 'Unknown error'}`
      });
      
      // Clear imported stores on error
      this.importedStoresSubject.next([]);
    } finally {
      this.loadingSubject.next(false);
    }
  }
} 