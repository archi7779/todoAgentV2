import type { TaskStatus } from "@/src/generated/prisma/enums";

export type TaskListItem = {
  id: string;
  title: string;
  status: TaskStatus;
  createdAt: string;
};

export type TaskListResponse = { tasks: TaskListItem[] };