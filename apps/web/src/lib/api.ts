export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

class ApiClient {
  private token: string | null = null;

  setToken(token: string | null) {
    this.token = token;
    if (typeof window !== 'undefined') {
      if (token) localStorage.setItem('token', token);
      else localStorage.removeItem('token');
    }
  }

  getToken(): string | null {
    if (this.token) return this.token;
    if (typeof window !== 'undefined') {
      this.token = localStorage.getItem('token');
    }
    return this.token;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const token = this.getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    let res: Response;
    try {
      // no-store: без этого браузер / Vercel CDN могут отдать закэшированный
      // GET /tasks и новая задача не появится до жёсткой перезагрузки.
      res = await fetch(`${API_URL}${path}`, { ...options, headers, cache: 'no-store' });
    } catch {
      throw new ApiError('Не удалось подключиться к серверу', 0);
    }

    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: { message: `Ошибка ${res.status}` } }));
      const msg = error.error?.message || error.message || `Ошибка ${res.status}`;
      throw new ApiError(msg, res.status);
    }
    return res.json();
  }

  register(data: { email: string; password: string; name?: string }) {
    return this.request<{ user: any; token: string; inboxId: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  login(data: { email: string; password: string }) {
    return this.request<{ user: any; token: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  me() {
    return this.request<{ user: any }>('/auth/me');
  }

  getTasks(params?: Record<string, string>) {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return this.request<{ tasks: any[] }>(`/tasks${query}`);
  }

  getTodayTasks() {
    return this.request<{ tasks: any[] }>('/tasks/today');
  }

  getOverdueTasks() {
    return this.request<{ tasks: any[] }>('/tasks/overdue');
  }

  getTask(id: string) {
    return this.request<{ task: any }>(`/tasks/${id}`);
  }

  getPendingReminders() {
    return this.request<{ reminders: any[] }>('/tasks/reminders/pending');
  }

  markReminderSent(id: string) {
    return this.request<{ success: boolean }>(`/tasks/reminders/${id}/sent`, { method: 'POST' });
  }

  setTaskReminder(taskId: string, remindMinutes: number | null) {
    return this.request<{ success: boolean; reminder: any }>(`/tasks/${taskId}/reminder`, {
      method: 'PUT',
      body: JSON.stringify({ remindMinutes }),
    });
  }

  createTask(data: any) {
    return this.request<{ task: any }>('/tasks', { method: 'POST', body: JSON.stringify(data) });
  }

  updateTask(id: string, data: any) {
    return this.request<{ task: any }>(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
  }

  deleteTask(id: string) {
    return this.request<{ success: boolean }>(`/tasks/${id}`, { method: 'DELETE' });
  }

  completeTask(id: string) {
    return this.request<{ task: any }>(`/tasks/${id}/complete`, { method: 'POST' });
  }

  addChecklistItem(taskId: string, data: { title: string; isCompleted?: boolean }) {
    return this.request<{ item: any }>(`/tasks/${taskId}/checklist`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  updateChecklistItem(taskId: string, itemId: string, data: any) {
    return this.request<{ item: any }>(`/tasks/${taskId}/checklist/${itemId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  deleteChecklistItem(taskId: string, itemId: string) {
    return this.request<{ success: boolean }>(`/tasks/${taskId}/checklist/${itemId}`, {
      method: 'DELETE',
    });
  }

  getProjects() {
    return this.request<{ projects: any[] }>('/projects');
  }

  createProject(data: any) {
    return this.request<{ project: any }>('/projects', { method: 'POST', body: JSON.stringify(data) });
  }

  deleteProject(id: string) {
    return this.request<{ success: boolean }>(`/projects/${id}`, { method: 'DELETE' });
  }

  getTags() {
    return this.request<{ tags: any[] }>('/tags');
  }

  createTag(data: any) {
    return this.request<{ tag: any }>('/tags', { method: 'POST', body: JSON.stringify(data) });
  }


  getTrash() {
    return this.request<{ tasks: any[] }>('/tasks/trash/list');
  }

  restoreTask(id: string) {
    return this.request<{ task: any }>(`/tasks/${id}/restore`, { method: 'POST' });
  }

  permanentDeleteTask(id: string) {
    return this.request<{ success: boolean }>(`/tasks/${id}/permanent`, { method: 'DELETE' });
  }

  emptyTrash() {
    return this.request<{ success: boolean }>('/tasks/trash/empty', { method: 'POST' });
  }

  archiveTask(id: string) {
    return this.request<{ task: any }>(`/tasks/${id}/archive`, { method: 'POST' });
  }

  unarchiveTask(id: string) {
    return this.request<{ task: any }>(`/tasks/${id}/unarchive`, { method: 'POST' });
  }

  // Habits
  getHabits() {
    return this.request<{ habits: any[] }>('/habits');
  }

  createHabit(data: any) {
    return this.request<{ habit: any }>('/habits', { method: 'POST', body: JSON.stringify(data) });
  }

  updateHabit(id: string, data: any) {
    return this.request<{ habit: any }>(`/habits/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
  }

  deleteHabit(id: string) {
    return this.request<{ success: boolean }>(`/habits/${id}`, { method: 'DELETE' });
  }

  logHabit(id: string, data: any) {
    return this.request<{ log: any }>(`/habits/${id}/log`, { method: 'POST', body: JSON.stringify(data) });
  }

  unlogHabit(id: string) {
    return this.request<{ success: boolean }>(`/habits/${id}/log`, {
      method: 'DELETE',
      body: JSON.stringify({}),
    });
  }

  // Goals
  getGoals() {
    return this.request<{ goals: any[] }>('/goals');
  }

  createGoal(data: any) {
    return this.request<{ goal: any }>('/goals', { method: 'POST', body: JSON.stringify(data) });
  }

  updateGoal(id: string, data: any) {
    return this.request<{ goal: any }>(`/goals/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
  }

  deleteGoal(id: string) {
    return this.request<{ success: boolean }>(`/goals/${id}`, { method: 'DELETE' });
  }

  // Focus
  getFocusSessions() {
    return this.request<{ sessions: any[] }>('/focus/sessions');
  }

  createFocusSession(data: any) {
    return this.request<{ session: any }>('/focus/sessions', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  getFocusStats() {
    return this.request<{
      totalMinutes: number;
      totalSessions: number;
      averageMinutes: number;
      byDay?: Record<string, number>;
    }>('/focus/stats');
  }

  getGraph(params?: Record<string, string>) {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return this.request<{ nodes: any[]; edges: any[] }>(`/graph${query}`);
  }

  getBirthdays() {
    return this.request<{ birthdays: any[] }>('/birthdays');
  }

  createBirthday(data: any) {
    return this.request<{ birthday: any }>('/birthdays', { method: 'POST', body: JSON.stringify(data) });
  }

  deleteBirthday(id: string) {
    return this.request<{ success: boolean }>(`/birthdays/${id}`, { method: 'DELETE' });
  }

  updateProfile(data: any) {
    return this.request<{ user: any }>('/auth/me', { method: 'PATCH', body: JSON.stringify(data) });
  }
}

export const api = new ApiClient();
