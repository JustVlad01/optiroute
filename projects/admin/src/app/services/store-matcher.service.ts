import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { BehaviorSubject } from 'rxjs';

export interface MatchedStore {
  id: number;
  excel_store_name: string;
  master_store_name: string;
  match_confidence: number;
  route_name: string;
  dispatch_code: string;
  store_code: string;
  store_company: string;
  address_line: string;
  total_quantity: number;
  crates_needed: number;
  hour_access_24: string;
  earliest_delivery_time: string;
}

export interface UnmatchedStore {
  id: number;
  route_name: string;
  store_name: string;
  total_quantity: number;
  crates_needed: number;
  import_date: string;
  import_batch_id: number;
}

export interface StoreMatchSummary {
  totalProcessed: number;
  totalMatched: number;
  matchedStores: MatchedStore[];
  unmatchedStores: UnmatchedStore[];
}

@Injectable({
  providedIn: 'root'
})
export class StoreMatcherService {
  private loadingSubject = new BehaviorSubject<boolean>(false);
  loading$ = this.loadingSubject.asObservable();

  private messageSubject = new BehaviorSubject<{type: 'success' | 'error', text: string} | null>(null);
  message$ = this.messageSubject.asObservable();

  private matchResultsSubject = new BehaviorSubject<StoreMatchSummary | null>(null);
  matchResults$ = this.matchResultsSubject.asObservable();

  constructor(private supabaseService: SupabaseService) { }

  /**
   * Match imported stores with master store data
   */
  async matchStores(): Promise<void> {
    this.loadingSubject.next(true);
    this.messageSubject.next(null);
    
    try {
      // Check if there are imported stores first
      const { data: importedStores, error: importError } = await this.supabaseService.client
        .from('excel_import_routes')
        .select('id')
        .limit(1);
      
      if (importError) {
        throw new Error(`Error checking imported stores: ${importError.message}`);
      }
      
      if (!importedStores || importedStores.length === 0) {
        throw new Error('No imported stores found. Please import Excel data first.');
      }
      
      // Call the direct matching function in Supabase - this handles clearing and matching in one operation
      const { data: matchResult, error: matchError } = await this.supabaseService.client
        .rpc('direct_match_stores_from_import');

      if (matchError) {
        // Check for various SQL errors
        if (matchError.message.includes('foreign key constraint')) {
          throw new Error('Cannot match stores due to database constraints. This might be because the store tables have been modified. Please try importing your data again.');
        } else if (matchError.message.includes('DELETE requires a WHERE clause')) {
          throw new Error('Database security restriction: Cannot clear existing matches. Please contact your database administrator.');
        } else if (matchError.message.includes('permission denied')) {
          throw new Error('Permission denied for database operation. Please contact your database administrator.');
        } else {
          throw new Error(`Error matching stores: ${matchError.message}`);
        }
      }
      
      if (!matchResult || !matchResult.success) {
        throw new Error(matchResult?.error || 'Store matching failed');
      }
      
      // Get the matched stores
      const { data: matchedStores, error: matchedError } = await this.supabaseService.client
        .rpc('view_direct_matched_stores');
        
      if (matchedError) {
        throw new Error(`Error retrieving matched stores: ${matchedError.message}`);
      }
      
      // Get the unmatched stores
      const { data: unmatchedStores, error: unmatchedError } = await this.supabaseService.client
        .rpc('view_direct_unmatched_stores');
        
      if (unmatchedError) {
        throw new Error(`Error retrieving unmatched stores: ${unmatchedError.message}`);
      }
      
      // Update the match results
      this.matchResultsSubject.next({
        totalProcessed: matchResult.total_processed || 0,
        totalMatched: matchResult.total_matched || 0,
        matchedStores: matchedStores || [],
        unmatchedStores: unmatchedStores || []
      });
      
      // Success message
      this.messageSubject.next({
        type: 'success',
        text: matchResult.message || `Successfully matched ${matchResult.total_matched} out of ${matchResult.total_processed} stores`
      });
      
    } catch (error: any) {
      console.error('Error matching stores:', error);
      this.messageSubject.next({
        type: 'error',
        text: `Error matching stores: ${error.message || 'Unknown error'}`
      });
      
      // Clear results on error
      this.matchResultsSubject.next(null);
    } finally {
      this.loadingSubject.next(false);
    }
  }

  /**
   * Match stores using improved fuzzy matching algorithm
   * This should catch more matches than the standard algorithm
   */
  async matchStoresImproved(): Promise<void> {
    this.loadingSubject.next(true);
    this.messageSubject.next(null);
    
    try {
      // Check if there are imported stores first
      const { data: importedStores, error: importError } = await this.supabaseService.client
        .from('excel_import_routes')
        .select('id')
        .limit(1);
      
      if (importError) {
        throw new Error(`Error checking imported stores: ${importError.message}`);
      }
      
      if (!importedStores || importedStores.length === 0) {
        throw new Error('No imported stores found. Please import Excel data first.');
      }
      
      // Call the improved matching function
      const { data: matchResult, error: matchError } = await this.supabaseService.client
        .rpc('improved_match_stores_from_import');

      if (matchError) {
        // Handle various errors
        if (matchError.message.includes('relation "pg_trgm" does not exist')) {
          throw new Error('The pg_trgm extension is not available in the database. Please ask your administrator to install it first.');
        } else if (matchError.message.includes('function improved_match_stores_from_import() does not exist')) {
          throw new Error('Improved matching function is not installed. Please run the improved_store_matcher.sql migration first.');
        } else {
          throw new Error(`Error matching stores: ${matchError.message}`);
        }
      }
      
      if (!matchResult || !matchResult.success) {
        throw new Error(matchResult?.error || 'Improved store matching failed');
      }
      
      // Get the matched stores
      const { data: matchedStores, error: matchedError } = await this.supabaseService.client
        .rpc('view_direct_matched_stores');
        
      if (matchedError) {
        throw new Error(`Error retrieving matched stores: ${matchedError.message}`);
      }
      
      // Get the unmatched stores
      const { data: unmatchedStores, error: unmatchedError } = await this.supabaseService.client
        .rpc('view_direct_unmatched_stores');
        
      if (unmatchedError) {
        throw new Error(`Error retrieving unmatched stores: ${unmatchedError.message}`);
      }
      
      // Update the match results
      this.matchResultsSubject.next({
        totalProcessed: matchResult.total_processed || 0,
        totalMatched: matchResult.total_matched || 0,
        matchedStores: matchedStores || [],
        unmatchedStores: unmatchedStores || []
      });
      
      // Success message
      this.messageSubject.next({
        type: 'success',
        text: matchResult.message || `Successfully matched ${matchResult.total_matched} out of ${matchResult.total_processed} stores with improved algorithm`
      });
      
    } catch (error: any) {
      console.error('Error matching stores with improved algorithm:', error);
      this.messageSubject.next({
        type: 'error',
        text: `Error matching stores: ${error.message || 'Unknown error'}`
      });
      
      // Clear results on error
      this.matchResultsSubject.next(null);
    } finally {
      this.loadingSubject.next(false);
    }
  }

  /**
   * Clear match results
   */
  clearMatchResults(): void {
    this.matchResultsSubject.next(null);
  }
} 