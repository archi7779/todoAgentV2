import { z } from "zod";
import { TaskStatus } from "@/src/generated/prisma/enums";


export const taskListQuerySchema = z.object({
  status: z.nativeEnum(TaskStatus).optional(),
  sort: z.enum(["desc", "asc"]).optional(),
});

export type TaskListQuery = z.infer<typeof taskListQuerySchema>;
