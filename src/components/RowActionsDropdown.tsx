import React from 'react';
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Edit, Trash2, Mail, Eye, RefreshCw, ListTodo, UserPlus, CheckSquare } from "lucide-react";

export interface RowAction {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
  separator?: boolean;
}

interface RowActionsDropdownProps {
  actions: RowAction[];
}

export const RowActionsDropdown = ({ actions }: RowActionsDropdownProps) => {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label="Open row actions menu">
          <MoreHorizontal className="w-4 h-4" aria-hidden="true" />
          <span className="sr-only">Open menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48 bg-popover border border-border shadow-lg z-50">
        {actions.map((action, index) => {
          const menuItem = (
            <DropdownMenuItem
              onClick={action.onClick}
              disabled={action.disabled}
              className={action.destructive ? "text-destructive focus:text-destructive" : ""}
              aria-label={action.label}
            >
              <span className="mr-2" aria-hidden="true">{action.icon}</span>
              {action.label}
            </DropdownMenuItem>
          );
          
          if (action.separator && index > 0) {
            return (
              <div key={index}>
                <DropdownMenuSeparator />
                {menuItem}
              </div>
            );
          }
          return <div key={index}>{menuItem}</div>;
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

// Export commonly used icons for convenience
export { Edit, Trash2, Mail, Eye, RefreshCw, ListTodo, UserPlus, CheckSquare };
