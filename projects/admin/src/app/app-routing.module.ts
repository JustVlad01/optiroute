import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { RoutePlannerComponent } from './components/route-planner/route-planner.component';

const routes: Routes = [
  { path: '', redirectTo: '/route-planner', pathMatch: 'full' },
  { path: 'route-planner', component: RoutePlannerComponent },
  { path: '**', redirectTo: '/route-planner' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { } 