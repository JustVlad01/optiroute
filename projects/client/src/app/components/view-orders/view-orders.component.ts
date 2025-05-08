import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SupabaseService } from '../../services/supabase.service';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { environment } from '../../../environments/environment.development';

interface StoreOrder {
  id?: string;
  customerName: string;
  customerCode?: string;
  totalItems: number;
  status?: string;
}

interface Route {
  id?: string;
  name: string;
  routeNumber?: string;
  driverName?: string;
  deliveryDate?: string;
  status?: string;
  stores: StoreOrder[];
}

interface Order {
  id?: string;
  fileName: string;
  importDate: string;
  deliveryDate: string;
  status?: string;
  routes: Route[];
}

@Component({
  selector: 'app-view-orders',
  standalone: true,
  imports: [CommonModule, HttpClientModule],
  templateUrl: './view-orders.component.html',
  styleUrls: ['./view-orders.component.scss']
})
export class ViewOrdersComponent implements OnInit {
  orders: Order[] = [];
  isLoading = false;
  errorMessage: string | null = null;
  expandedOrderIds: Set<string> = new Set();
  expandedRouteIds: Map<string, Set<string>> = new Map();

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.loadOrders();
  }

  loadOrders(): void {
    this.isLoading = true;
    this.errorMessage = null;

    this.http.get<any[]>(`${environment.apiUrl}/api/orders`)
      .subscribe({
        next: (data) => {
          this.orders = this.processOrdersData(data);
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Error loading orders:', error);
          this.errorMessage = 'Failed to load orders. Please try again later.';
          this.isLoading = false;
        }
      });
  }

  private processOrdersData(data: any[]): Order[] {
    // Group by import ID to create hierarchical structure
    const orderMap = new Map<string, Order>();
    
    data.forEach(item => {
      const importId = item.import_id.toString();
      
      if (!orderMap.has(importId)) {
        orderMap.set(importId, {
          id: importId,
          fileName: item.file_name,
          importDate: item.import_date,
          deliveryDate: item.order_delivery_date,
          status: item.order_status,
          routes: []
        });
      }

      const order = orderMap.get(importId)!;
      
      // Check if the route is already added
      const routeId = item.route_id.toString();
      let route = order.routes.find(r => r.id === routeId);
      
      if (!route) {
        route = {
          id: routeId,
          name: item.route_name,
          routeNumber: item.route_number,
          driverName: item.driver_name,
          deliveryDate: item.route_delivery_date,
          status: item.route_status,
          stores: []
        };
        order.routes.push(route);
      }
      
      // Add the store to the route
      route.stores.push({
        id: item.store_id.toString(),
        customerName: item.customer_name,
        customerCode: item.customer_code,
        totalItems: item.total_items,
        status: item.store_status
      });
    });
    
    return Array.from(orderMap.values());
  }

  toggleOrderExpand(orderId: string): void {
    if (this.expandedOrderIds.has(orderId)) {
      this.expandedOrderIds.delete(orderId);
    } else {
      this.expandedOrderIds.add(orderId);
    }
  }

  isOrderExpanded(orderId: string): boolean {
    return this.expandedOrderIds.has(orderId);
  }

  toggleRouteExpand(orderId: string, routeId: string): void {
    if (!this.expandedRouteIds.has(orderId)) {
      this.expandedRouteIds.set(orderId, new Set());
    }
    
    const routeSet = this.expandedRouteIds.get(orderId)!;
    
    if (routeSet.has(routeId)) {
      routeSet.delete(routeId);
    } else {
      routeSet.add(routeId);
    }
  }

  isRouteExpanded(orderId: string, routeId: string): boolean {
    return this.expandedRouteIds.has(orderId) && 
           this.expandedRouteIds.get(orderId)!.has(routeId);
  }

  calculateTotalItems(route: Route): number {
    return route.stores.reduce((total, store) => total + store.totalItems, 0);
  }

  calculateTotalStores(route: Route): number {
    return route.stores.length;
  }

  refreshOrders(): void {
    this.loadOrders();
  }
} 