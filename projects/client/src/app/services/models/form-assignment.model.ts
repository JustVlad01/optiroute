export interface FormAssignment {
  id: string;
  driver_id: string;
  driver_name?: string;
  status: string;
  due_date: string;
  dueDate?: string; // Backward compatibility
  assignedDate?: string; // Backward compatibility
  completed_at: string | null;
  form_id: string | null;
  notes: string | null;
  created_at: string;
  reset_period?: number;
  partial_form_data?: any;
  partially_completed?: boolean;
  recurring?: boolean; // For recurring forms
  form_type?: string; // Type of form (e.g., 'daily_driver', 'rejected_order_checklist')
} 