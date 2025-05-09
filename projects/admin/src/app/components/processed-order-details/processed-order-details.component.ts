import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';

interface ProcessedStore {
  id: string;
  customerName: string;
  customerCode?: string;
  address?: string;
  eircode?: string;
  dispatchCode?: string;
  storeCode?: string;
  storeName?: string;
  totalItems: number;
  matchQuality: 'none' | 'partial' | 'full' | 'checking';
}

interface ProcessedRoute {
  id: string;
  name: string;
  routeNumber?: string;
  stores: ProcessedStore[];
}

interface ProcessedOrder {
  id: string;
  importId: string;
  fileName: string;
  deliveryDate?: string;
  processedAt: string;
  status: string;
  totalStores: number;
  matchedStores: number;
  unmatchedStores: number;
  routes: ProcessedRoute[];
}

@Component({
  selector: 'app-processed-order-details',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="processed-order-container">
      <!-- Main navigation bar -->
      <header class="navbar">
        <div class="logo">OPTIROUTE</div>
        <div class="nav-links">
          <a class="nav-pill" routerLink="/view-orders">
            <i class="bi bi-arrow-left"></i> Back to Orders
          </a>
        </div>
      </header>

      <!-- Content area -->
      <div class="content">
        <div class="page-header">
          <h2 class="page-title">Processed Order Details</h2>
          <div class="page-actions">
            <button class="refresh-button" (click)="refreshData()">
              <i class="bi bi-arrow-clockwise"></i> Refresh
            </button>
          </div>
        </div>

        <!-- Loading indicator -->
        <div *ngIf="isLoading" class="loading-spinner">
          <p><i class="bi bi-hourglass-split"></i> Loading processed order details...</p>
        </div>

        <!-- Error message -->
        <div *ngIf="errorMessage" class="alert alert-danger">
          {{ errorMessage }}
        </div>

        <!-- Order information -->
        <div *ngIf="!isLoading && !errorMessage && processedOrder" class="order-info">
          <div class="order-header">
            <h3>{{ processedOrder.fileName }}</h3>
            <div class="order-stats">
              <span class="stat-item" title="Delivery Date">
                <i class="bi bi-calendar-date"></i> {{ processedOrder.deliveryDate | date }}
              </span>
              <span class="stat-item" title="Processed Date">
                <i class="bi bi-clock"></i> {{ processedOrder.processedAt | date:'short' }}
              </span>
              <span class="stat-item" title="Total Stores">
                <i class="bi bi-shop"></i> {{ processedOrder.totalStores }} stores
              </span>
              <span class="stat-item matched" title="Matched Stores">
                <i class="bi bi-check-circle"></i> {{ processedOrder.matchedStores }} matched
              </span>
              <span class="stat-item unmatched" title="Unmatched Stores">
                <i class="bi bi-exclamation-triangle"></i> {{ processedOrder.unmatchedStores }} need review
              </span>
            </div>
          </div>

          <!-- Routes and stores -->
          <div class="routes-container">
            <div *ngFor="let route of processedOrder.routes" class="route-card">
              <div class="route-header">
                <h4>{{ route.name }}</h4>
                <span *ngIf="route.routeNumber" class="route-number">{{ route.routeNumber }}</span>
              </div>

              <div class="stores-table-wrapper">
                <table class="stores-table">
                  <thead>
                    <tr>
                      <th>Dispatch Code</th>
                      <th>Store Code</th>
                      <th>Store Name</th>
                      <th>Address</th>
                      <th>Eircode</th>
                      <th>Items</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr *ngFor="let store of route.stores" [ngClass]="'match-' + store.matchQuality">
                      <td>{{ store.dispatchCode || 'N/A' }}</td>
                      <td>{{ store.storeCode || 'N/A' }}</td>
                      <td>{{ store.customerName }}</td>
                      <td>{{ store.address || 'Not available' }}</td>
                      <td>{{ store.eircode || 'N/A' }}</td>
                      <td>{{ store.totalItems }}</td>
                      <td>
                        <span class="match-badge" [ngClass]="'status-' + store.matchQuality">
                          {{ getMatchStatusLabel(store.matchQuality) }}
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <!-- No data message -->
        <div *ngIf="!isLoading && !errorMessage && !processedOrder" class="no-data">
          <p>No processed order data found. The order may not have been processed yet.</p>
          <a routerLink="/view-orders" class="back-link">Return to orders list</a>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .processed-order-container {
      display: flex;
      flex-direction: column;
      height: 100vh;
      background-color: #f8f9fa;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      overflow: hidden;
    }

    .navbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.8rem 1.5rem;
      background-color: #fff;
      box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
      height: 60px;
      flex-shrink: 0;
    }

    .logo {
      font-size: 1.5rem;
      font-weight: bold;
      color: #0056b3;
    }

    .nav-links {
      display: flex;
      gap: 1rem;
    }

    .nav-pill {
      display: inline-flex;
      align-items: center;
      padding: 0.5rem 1rem;
      border-radius: 4px;
      background-color: #e9ecef;
      color: #495057;
      text-decoration: none;
      cursor: pointer;
      transition: background-color 0.2s;
    }

    .nav-pill:hover {
      background-color: #dee2e6;
    }

    .content {
      padding: 1.5rem;
      flex: 1;
      overflow: auto;
    }

    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1.5rem;
    }

    .page-title {
      margin: 0;
      font-size: 1.75rem;
      color: #2c3e50;
      font-weight: 600;
    }

    .refresh-button {
      padding: 0.5rem 1rem;
      background-color: #0056b3;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      transition: background-color 0.2s;
    }

    .refresh-button:hover {
      background-color: #003d7a;
    }

    .loading-spinner {
      text-align: center;
      padding: 2rem;
      color: #7f8c8d;
    }

    .alert {
      padding: 1rem;
      border-radius: 4px;
      margin-bottom: 1rem;
    }

    .alert-danger {
      background-color: #f8d7da;
      color: #721c24;
      border: 1px solid #f5c6cb;
    }

    .no-data {
      text-align: center;
      padding: 3rem;
      background-color: white;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
      color: #6c757d;
    }

    .back-link {
      display: inline-block;
      margin-top: 1rem;
      color: #0056b3;
      text-decoration: none;
    }

    .back-link:hover {
      text-decoration: underline;
    }

    .order-info {
      background-color: white;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
      overflow: hidden;
      margin-bottom: 2rem;
    }

    .order-header {
      padding: 1.5rem;
      background-color: #f8f9fa;
      border-bottom: 1px solid #dee2e6;
    }

    .order-header h3 {
      margin: 0 0 1rem 0;
      color: #2c3e50;
      font-weight: 600;
    }

    .order-stats {
      display: flex;
      flex-wrap: wrap;
      gap: 1rem;
    }

    .stat-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      background-color: #e9ecef;
      padding: 0.5rem 0.75rem;
      border-radius: 4px;
      font-size: 0.875rem;
      color: #495057;
    }

    .stat-item.matched {
      background-color: #d4edda;
      color: #155724;
    }

    .stat-item.unmatched {
      background-color: #f8d7da;
      color: #721c24;
    }

    .routes-container {
      padding: 1.5rem;
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    .route-card {
      border: 1px solid #dee2e6;
      border-radius: 8px;
      overflow: hidden;
    }

    .route-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1rem 1.5rem;
      background-color: #f8f9fa;
      border-bottom: 1px solid #dee2e6;
    }

    .route-header h4 {
      margin: 0;
      color: #2c3e50;
      font-weight: 600;
    }

    .route-number {
      background-color: #0056b3;
      color: white;
      padding: 0.25rem 0.75rem;
      border-radius: 4px;
      font-size: 0.875rem;
    }

    .stores-table-wrapper {
      overflow-x: auto;
    }

    .stores-table {
      width: 100%;
      border-collapse: collapse;
    }

    .stores-table th, .stores-table td {
      padding: 0.75rem 1rem;
      border-bottom: 1px solid #dee2e6;
      text-align: left;
    }

    .stores-table th {
      background-color: #f8f9fa;
      font-weight: 600;
      color: #495057;
    }

    .stores-table tbody tr:last-child td {
      border-bottom: none;
    }

    .stores-table tbody tr:hover {
      background-color: #f8f9fa;
    }

    tr.match-full {
      background-color: #f0fff4;
    }

    tr.match-partial {
      background-color: #fffcf0;
    }

    tr.match-checking, tr.match-none {
      background-color: #fff0f0;
    }

    .match-badge {
      display: inline-block;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 600;
    }

    .status-full {
      background-color: #d4edda;
      color: #155724;
    }

    .status-partial {
      background-color: #fff3cd;
      color: #856404;
    }

    .status-checking, .status-none {
      background-color: #f8d7da;
      color: #721c24;
    }
  `]
})
export class ProcessedOrderDetailsComponent implements OnInit {
  processedOrder: ProcessedOrder | null = null;
  isLoading = true;
  errorMessage: string | null = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private http: HttpClient
  ) {}

  ngOnInit(): void {
    this.route.paramMap.subscribe(params => {
      const id = params.get('id');
      if (id) {
        this.loadProcessedOrderDetails(id);
      } else {
        this.errorMessage = 'No processed order ID provided';
        this.isLoading = false;
      }
    });
  }

  async loadProcessedOrderDetails(id: string): Promise<void> {
    this.isLoading = true;
    this.errorMessage = null;

    try {
      const response = await this.http.get<any>(`/api/processed-orders/${id}`).toPromise();
      this.processedOrder = response;
    } catch (error: any) {
      console.error('Error loading processed order details:', error);
      this.errorMessage = 'Failed to load processed order details. Please try again later.';
    } finally {
      this.isLoading = false;
    }
  }

  refreshData(): void {
    if (this.processedOrder) {
      this.loadProcessedOrderDetails(this.processedOrder.id);
    }
  }

  getMatchStatusLabel(matchQuality: string): string {
    switch (matchQuality) {
      case 'full':
        return 'Matched';
      case 'partial':
        return 'Partial Match';
      case 'checking':
        return 'Needs Review';
      case 'none':
        return 'No Match';
      default:
        return matchQuality;
    }
  }
} 