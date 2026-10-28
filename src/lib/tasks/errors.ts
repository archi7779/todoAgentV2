import { TASK_LIMIT_PER_USER } from "./constants";

export class TaskNotFoundError extends Error {
  constructor(
    public readonly taskId: string,
    public readonly cause?: unknown,
  ) {
    super(`Задача не найдена: ${taskId}`);
    this.name = "TaskNotFoundError";
  }
}

export class TaskLimitReachedError  extends Error {
  constructor(
    public readonly cause?: unknown,
  ) {
    super(`Достингул максимальный лимит задач в ${TASK_LIMIT_PER_USER} штук`);
    this.name = "TaskNotFoundError";
  }
}