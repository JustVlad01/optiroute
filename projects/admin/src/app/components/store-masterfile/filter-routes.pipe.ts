import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'filterRoutes',
  standalone: true
})
export class FilterRoutesPipe implements PipeTransform {
  transform(routes: string[], searchTerm?: string): string[] {
    if (!routes || !routes.length) {
      return [];
    }

    if (!searchTerm) {
      return routes;
    }

    const term = searchTerm.toLowerCase();
    return routes.filter(route => route.toLowerCase().includes(term));
  }
} 