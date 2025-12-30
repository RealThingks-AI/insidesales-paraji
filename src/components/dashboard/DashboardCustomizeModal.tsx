import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { 
  GripVertical, FileText, Users, Briefcase, Zap, Calendar, Activity, Bell, 
  Mail, Building2, ListTodo, CalendarClock, ClipboardList
} from "lucide-react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";

export type WidgetKey = 
  | "leads" | "contacts" | "deals" | "quickActions" 
  | "upcomingMeetings" | "recentActivities" | "taskReminders" | "emailStats"
  | "accountsSummary" | "weeklySummary" | "followUpsDue" | "todaysAgenda";

export interface WidgetLayout {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface WidgetLayoutConfig {
  [key: string]: WidgetLayout;
}

export interface DashboardWidget {
  key: WidgetKey;
  label: string;
  icon: React.ReactNode;
  visible: boolean;
  defaultLayout: WidgetLayout;
}

const DEFAULT_WIDGETS: DashboardWidget[] = [
  // Row 1: Core stat widgets (4x3 each = 12 total)
  { key: "leads", label: "My Leads", icon: <FileText className="w-4 h-4" />, visible: true, defaultLayout: { x: 0, y: 0, w: 3, h: 2 } },
  { key: "contacts", label: "My Contacts", icon: <Users className="w-4 h-4" />, visible: true, defaultLayout: { x: 3, y: 0, w: 3, h: 2 } },
  { key: "deals", label: "My Deals", icon: <Briefcase className="w-4 h-4" />, visible: true, defaultLayout: { x: 6, y: 0, w: 3, h: 2 } },
  { key: "accountsSummary", label: "Accounts Summary", icon: <Building2 className="w-4 h-4" />, visible: true, defaultLayout: { x: 9, y: 0, w: 3, h: 2 } },
  
  // Row 2: Quick Actions
  { key: "quickActions", label: "Quick Actions", icon: <Zap className="w-4 h-4" />, visible: true, defaultLayout: { x: 0, y: 2, w: 6, h: 2 } },
  
  // Row 3: Today's Agenda + Upcoming Meetings + Task Reminders
  { key: "todaysAgenda", label: "Today's Agenda", icon: <CalendarClock className="w-4 h-4" />, visible: true, defaultLayout: { x: 0, y: 4, w: 4, h: 3 } },
  { key: "upcomingMeetings", label: "Upcoming Meetings", icon: <Calendar className="w-4 h-4" />, visible: true, defaultLayout: { x: 4, y: 4, w: 4, h: 3 } },
  { key: "taskReminders", label: "Task Reminders", icon: <Bell className="w-4 h-4" />, visible: true, defaultLayout: { x: 8, y: 4, w: 4, h: 3 } },
  
  // Row 4: Recent Activities + Email Stats
  { key: "recentActivities", label: "Recent Activities", icon: <Activity className="w-4 h-4" />, visible: true, defaultLayout: { x: 0, y: 7, w: 6, h: 3 } },
  { key: "emailStats", label: "Email Statistics", icon: <Mail className="w-4 h-4" />, visible: true, defaultLayout: { x: 6, y: 7, w: 6, h: 3 } },
  
  // Row 5: Weekly Summary + Follow-Ups Due
  { key: "weeklySummary", label: "Weekly Summary", icon: <ListTodo className="w-4 h-4" />, visible: true, defaultLayout: { x: 0, y: 10, w: 6, h: 2 } },
  { key: "followUpsDue", label: "Follow-Ups Due", icon: <ClipboardList className="w-4 h-4" />, visible: true, defaultLayout: { x: 6, y: 10, w: 6, h: 2 } },
];

interface DashboardCustomizeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  visibleWidgets: WidgetKey[];
  widgetOrder: WidgetKey[];
  onSave: (visibleWidgets: WidgetKey[], widgetOrder: WidgetKey[]) => void;
  isSaving?: boolean;
}

export const DashboardCustomizeModal = ({
  open,
  onOpenChange,
  visibleWidgets,
  widgetOrder,
  onSave,
  isSaving = false,
}: DashboardCustomizeModalProps) => {
  const [widgets, setWidgets] = useState<DashboardWidget[]>([]);

  useEffect(() => {
    // Initialize widgets state based on current order and visibility
    const orderedWidgets: DashboardWidget[] = [];
    
    // First add widgets in the saved order
    widgetOrder.forEach(key => {
      const defaultWidget = DEFAULT_WIDGETS.find(w => w.key === key);
      if (defaultWidget) {
        orderedWidgets.push({
          ...defaultWidget,
          visible: visibleWidgets.includes(key),
        });
      }
    });
    
    // Add any missing widgets at the end
    DEFAULT_WIDGETS.forEach(w => {
      if (!orderedWidgets.find(ow => ow.key === w.key)) {
        orderedWidgets.push({
          ...w,
          visible: visibleWidgets.includes(w.key),
        });
      }
    });
    
    setWidgets(orderedWidgets);
  }, [visibleWidgets, widgetOrder, open]);

  const toggleWidget = (key: WidgetKey) => {
    setWidgets(prev =>
      prev.map(w => (w.key === key ? { ...w, visible: !w.visible } : w))
    );
  };

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    
    const items = Array.from(widgets);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);
    
    setWidgets(items);
  };

  const handleSave = () => {
    const visible = widgets.filter(w => w.visible).map(w => w.key);
    const order = widgets.map(w => w.key);
    onSave(visible, order);
  };

  const handleReset = () => {
    setWidgets(DEFAULT_WIDGETS.map(w => ({ ...w, visible: true })));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Customize Dashboard</DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 overflow-y-auto py-4">
          <p className="text-sm text-muted-foreground mb-4">
            Drag to reorder and toggle widget visibility. Use the <strong>Resize</strong> button on the dashboard to freely resize widgets.
          </p>
          
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="widgets">
              {(provided) => (
                <div
                  {...provided.droppableProps}
                  ref={provided.innerRef}
                  className="space-y-2"
                >
                  {widgets.map((widget, index) => (
                    <Draggable key={widget.key} draggableId={widget.key} index={index}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          className={`flex items-center justify-between p-3 rounded-lg border bg-card transition-colors ${
                            snapshot.isDragging ? "shadow-lg ring-2 ring-primary/20" : "hover:bg-accent/50"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div
                              {...provided.dragHandleProps}
                              className="cursor-grab active:cursor-grabbing"
                            >
                              <GripVertical className="w-4 h-4 text-muted-foreground" />
                            </div>
                            <div className={widget.visible ? "text-foreground" : "text-muted-foreground"}>
                              {widget.icon}
                            </div>
                            <Label 
                              htmlFor={widget.key} 
                              className={`cursor-pointer font-medium ${!widget.visible && "text-muted-foreground"}`}
                            >
                              {widget.label}
                            </Label>
                          </div>
                          <Switch
                            id={widget.key}
                            checked={widget.visible}
                            onCheckedChange={() => toggleWidget(widget.key)}
                          />
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2 pt-4 border-t">
          <Button variant="outline" onClick={handleReset} className="sm:mr-auto">
            Reset to Default
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export { DEFAULT_WIDGETS };
