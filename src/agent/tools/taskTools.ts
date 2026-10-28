import "server-only"
import {tool, ToolRunnableConfig} from '@langchain/core/tools'
import {z } from 'zod'
import { taskService } from "@/src/lib/tasks"
import { withAgentLog } from "@/src/lib/logger/with-agent-logger"
import { ConfigurationError } from "../errors"
import { TaskLimitReachedError, TaskNotFoundError } from "@/src/lib/tasks/errors"
import { logger } from "@/src/lib/logger"
import { TASK_LIMIT_PER_USER } from "@/src/lib/tasks/constants"
import { TaskStatus } from "@/src/generated/prisma/enums"
import { interrupt } from "@langchain/langgraph"

const requireUserId = (config: ToolRunnableConfig): string => {
  const userId = config.configurable?.userId
    if (typeof userId !== "string" || userId.length === 0) {
         throw new ConfigurationError('Агенту не передан userID!')
    }
   return userId
 }
const taskSchema = z.object({
    title:z.string().trim().min(1, 'минимум 1 символ').max(200, 'миксимум 200 символов'),
    description: z.string().min(1, 'минимум 1 символ').max(2000, 'миксимум 2000 символов').optional()
})

  
 const createTaskTool = tool(
    withAgentLog('create_task', 
    async (input: z.infer<typeof taskSchema>, config: ToolRunnableConfig) => {
    const userId = requireUserId(config)

    try{
       const newTask = await taskService.create(userId, input)
       return JSON.stringify({ id: newTask.id, title: newTask.title, status: newTask.status })
    }catch(err){
       if (err instanceof TaskLimitReachedError) {
         logger.warn({ err }, "create_task: достигнут лимит задач")
         return  `ОШИБКА: Не удалось создать задачу: достигнут лимит ${TASK_LIMIT_PER_USER} задач.Объясни пользователю и предложи закрыть или удалить одну из существующих. Не повторяй попытку создания.` 
      }
      throw err; 
    }  
  },
    ),
  {
    name: "create_task",
    description: `
    Создаёт задачу в личном списке дел текущего пользователя.
Используй, когда пользователь просит запомнить, добавить или запланировать дело
(«напомни купить хлеб», «добавь задачу позвонить маме»).
НЕ используй, чтобы показать, закрыть, изменить или удалить задачи — для этого
есть другие инструменты.

Аргументы:
- title: короткая формулировка в императиве, 1–200 символов, без дат и «воды»
  («Купить хлеб», а не «Нужно купить хлеб завтра»).
- description (необязательно): детали, контекст, ссылки. Если пользователь ничего
  не уточнил — не передавай и не придумывай.
  `,
    schema: taskSchema,
  },
);

const listTaskTool = tool(
  withAgentLog('list_task', async (_input, config: ToolRunnableConfig)=>{
    const userId = requireUserId(config)
        const tasks = await taskService.list(userId)
        return JSON.stringify({count: tasks.length, tasks: tasks.map(t => ({ ...t, createdAt: t.createdAt.toISOString().slice(0, 10) }))})
  }), 
   {
    name: "list_tasks",
    description: 
    `Возвращает список задач текущего пользователя (сначала новые).
     Используй, когда пользователь просит показать задачи, спрашивает «что мне делать»,
     «что у меня в списке», «какие задачи я не закрыл».
     Аргументов нет: возвращаются все задачи пользователя.
     НЕ используй для поиска по смыслу или по словам — фильтров нет.
     Также вызывай этот инструмент перед update/delete, если пользователь называет
     задачу по смыслу («задача про хлеб»), а её id тебе неизвестен.
     Не угадывай id — всегда сначала получи список.
     Если подходящих задач несколько — не выбирай сам, спроси пользователя,
     какую именно он имеет в виду.
     `,
    schema: z.object({})
  },
)

const updateTaskSheema = z.object({
    taskId: z.string().min(1),
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().max(2000).nullable().optional(),
    status:z.nativeEnum(TaskStatus).optional()
   }).refine(
  (args) => args.title !== undefined || args.description !== undefined || args.status !== undefined,
  { message: "Нужно хотя бы одно поле кроме taskId" },
)
const updateTaskTool = tool(
   withAgentLog('update_task', async ({taskId, title, description, status}:z.infer<typeof updateTaskSheema>, config: ToolRunnableConfig)=>{
      const userId = requireUserId(config)
     try { 
      const task =  await taskService.update(userId, taskId, { title, description, status })
      return JSON.stringify(task)  
    }
     catch(err){
       if (err instanceof TaskNotFoundError) {
         logger.warn({ err }, "update_task: задача не найдена")
         return  `ОШИБКА: задача с таким id не найдена.
Если в этом диалоге ты уже получал список задач — возьми актуальный id из него и не вызывай list_tasks повторно.
Если списка нет — вызови list_tasks.
Не повторяй запрос с тем же taskId.` 
      }
      throw err; 
    }  
    }), 
   {
   name: "update_task",
   description:`Используй для изменения задачи(смена статуса, заголовка, описания)
    Если не знаешь taskId — сначала вызови list_tasks и не угадывай id.
  Если подходящих задач несколько — спроси пользователя, какую менять.
  Закрыть задачу = status: "DONE".`,
   schema: updateTaskSheema
   }
)

const deleteTaskSheema = z.object({
  taskId: z.string().min(1)
})
const deleteTaskTool = tool(
  withAgentLog('delete_task', async (input:z.infer<typeof deleteTaskSheema>, config: ToolRunnableConfig)=>{
      const userId = requireUserId(config)
      const taskToDelete = await taskService.getById(userId, input.taskId)
      if (!taskToDelete) {
        return "ОШИБКА: задача не найдена. Не угадывай taskId — вызови list_tasks.";
      }
      const decision = interrupt<
      { type: "confirm_delete"; taskId: string; title: string, status: TaskStatus },
      { approved: boolean }>
      ({ type: "confirm_delete", taskId: taskToDelete.id, title: taskToDelete.title, status: taskToDelete.status  });
     if (!decision?.approved) {
      return "Пользователь отменил удаление. Задача НЕ удалена. Не повторяй вызов — спроси, что делать дальше.";
    }
     const { count } = await taskService.remove(userId, taskToDelete.id);
      if (count === 0) {
      return "Задача уже удалена или не найдена. Ничего делать не нужно.";
    }
     return JSON.stringify({ deleted: true, id: taskToDelete.id, title: taskToDelete.title });
    }),
  {
    name: "delete_task",
    description: `Удаляет задачу пользователя безвозвратно.
Используй, когда пользователь явно просит удалить задачу.
Перед удалением система сама спросит подтверждение — просто вызови инструмент и дождись результата. Не отказывайся удалять из осторожности.
Если не знаешь taskId — сначала вызови list_tasks, не угадывай id.
Если подходящих задач несколько — спроси пользователя, какую удалить.
Закрыть задачу ≠ удалить: для этого update_task со status "DONE".
`,
    schema:deleteTaskSheema
  }
)
export const taskTools = [createTaskTool,listTaskTool,updateTaskTool, deleteTaskTool]