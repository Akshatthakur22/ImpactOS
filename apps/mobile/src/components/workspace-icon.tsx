import React from "react";
import {
  Home,
  Calendar,
  CheckCircle2,
  Users,
  Clock,
  User,
  Bell,
  Wallet,
  ChevronRight,
  ChevronLeft,
  MapPin,
  AlertCircle,
  Check,
  RefreshCw,
  Plus,
  Search,
  SlidersHorizontal,
  LogOut,
  Award,
  Briefcase,
  FileText,
  MessageSquare,
  Sparkles,
  Shield,
  ArrowRight,
  Circle,
  X,
  Compass,
} from "lucide-react-native";

export type WorkspaceIconName =
  | "home"
  | "calendar"
  | "attendance"
  | "progress"
  | "wallet"
  | "profile"
  | "students"
  | "work"
  | "bell"
  | "chevron-right"
  | "chevron-left"
  | "map-pin"
  | "alert"
  | "check"
  | "refresh"
  | "plus"
  | "search"
  | "sliders"
  | "log-out"
  | "award"
  | "briefcase"
  | "file-text"
  | "message-square"
  | "sparkles"
  | "shield"
  | "arrow-right"
  | "circle"
  | "close"
  | "compass"
  | "clock";

interface WorkspaceIconProps {
  name: WorkspaceIconName;
  color?: string;
  size?: number;
  strokeWidth?: number;
}

export function WorkspaceIcon({
  name,
  color = "#1D1D1F",
  size = 20,
  strokeWidth = 2,
}: WorkspaceIconProps) {
  const iconProps = { size, color, strokeWidth };

  switch (name) {
    case "home":
      return <Home {...iconProps} />;
    case "calendar":
      return <Calendar {...iconProps} />;
    case "attendance":
      return <CheckCircle2 {...iconProps} />;
    case "progress":
      return <Award {...iconProps} />;
    case "wallet":
      return <Wallet {...iconProps} />;
    case "profile":
      return <User {...iconProps} />;
    case "students":
      return <Users {...iconProps} />;
    case "work":
    case "briefcase":
      return <Briefcase {...iconProps} />;
    case "bell":
      return <Bell {...iconProps} />;
    case "chevron-right":
      return <ChevronRight {...iconProps} />;
    case "chevron-left":
      return <ChevronLeft {...iconProps} />;
    case "map-pin":
      return <MapPin {...iconProps} />;
    case "alert":
      return <AlertCircle {...iconProps} />;
    case "check":
      return <Check {...iconProps} />;
    case "refresh":
      return <RefreshCw {...iconProps} />;
    case "plus":
      return <Plus {...iconProps} />;
    case "search":
      return <Search {...iconProps} />;
    case "sliders":
      return <SlidersHorizontal {...iconProps} />;
    case "log-out":
      return <LogOut {...iconProps} />;
    case "award":
      return <Award {...iconProps} />;
    case "file-text":
      return <FileText {...iconProps} />;
    case "message-square":
      return <MessageSquare {...iconProps} />;
    case "sparkles":
      return <Sparkles {...iconProps} />;
    case "shield":
      return <Shield {...iconProps} />;
    case "arrow-right":
      return <ArrowRight {...iconProps} />;
    case "circle":
      return <Circle {...iconProps} />;
    case "close":
      return <X {...iconProps} />;
    case "compass":
      return <Compass {...iconProps} />;
    case "clock":
      return <Clock {...iconProps} />;
    default:
      return <Home {...iconProps} />;
  }
}
