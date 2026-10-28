import "server-only"
import {prisma} from '@/src/lib/prisma'
import { TaskLimitReachedError, TaskNotFoundError } from "./errors"
import { TASK_LIMIT_PER_USER } from "./constants"
import { TaskStatus } from "@/src/generated/prisma/enums"

type CreateTaskInput = {
  title: string
  description?: string | null
}
type UpdateTaskInput = {
  title?: string
  description?: string | null
  status?: TaskStatus
}
export const taskService  = {
    create: async (userId: string, input: CreateTaskInput) =>{
        const userTasks = await prisma.task.count({where: {userId}})
        if(userTasks >= TASK_LIMIT_PER_USER){
            throw new TaskLimitReachedError()
        }
        const task = prisma.task.create({data: {userId, title: input.title, description: input.description}})
        return task
    },
    list: (userId: string, filters?:{ status?: TaskStatus; sort?: "desc" | "asc" }) => {
        return prisma.task.findMany({where: {userId, status: filters?.status}, orderBy: {createdAt: filters?.sort ?? 'desc'}, select: {id: true, title: true, status:true, createdAt: true}})
    },
    update: async (userId: string, taskId: string, input: UpdateTaskInput) => {
        const [updated] = await prisma.task.updateManyAndReturn({
        where: { id: taskId, userId },
        data: { title: input.title, description: input.description, status: input.status },
        select: { id: true, title: true, status: true },
        });

      if (!updated) throw new TaskNotFoundError(taskId);
      return updated
    },
    getById: (userId: string, taskId: string) => {
        const task = prisma.task.findFirst({
            where: {userId, id:taskId},
            select: { id: true, title: true, status: true }
        })
        return task
    },
   remove: (userId: string, taskId: string) => {
        return prisma.task.deleteMany({
            where: {id:taskId, userId}
        })
   }
}


