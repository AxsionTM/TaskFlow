export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
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
      const code = error.error?.code || error.code;
      throw new ApiError(msg, res.status, code);
    }
    return res.json();
  }

  register(data: { email: string; password: string; confirmPassword: string; name?: string }) {
    return this.request<{
      requiresVerification: boolean;
      email: string;
      emailSent: boolean;
      devCode?: string;
    }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  verifyEmail(data: { email: string; code: string }) {
    return this.request<{ user: any; token: string; inboxId: string }>('/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  resendCode(data: { email: string; purpose?: 'verify' | 'reset' }) {
    return this.request<{ ok: boolean; message: string; emailSent?: boolean; devCode?: string }>(
      '/auth/resend-code',
      { method: 'POST', body: JSON.stringify(data) }
    );
  }

  forgotPassword(data: { email: string }) {
    return this.request<{ ok: boolean; message: string; devCode?: string }>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  verifyResetCode(data: { email: string; code: string }) {
    return this.request<{ ok: boolean; resetToken: string }>('/auth/verify-reset-code', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  resetPassword(data: { resetToken: string; password: string; confirmPassword: string }) {
    return this.request<{ ok: boolean; message: string; user: any; token: string }>(
      '/auth/reset-password',
      { method: 'POST', body: JSON.stringify(data) }
    );
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

  setTaskReminder(taskId: string, remindMinutes: number | null, repeatMinutes?: number | null) {
    return this.request<{ success: boolean; reminder: any }>(`/tasks/${taskId}/reminder`, {
      method: 'PUT',
      body: JSON.stringify({
        remindMinutes,
        repeatMinutes: repeatMinutes ?? null,
      }),
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

  createTag(data: { name: string; color?: string; icon?: string | null }) {
    return this.request<{ tag: any }>('/tags', { method: 'POST', body: JSON.stringify(data) });
  }

  deleteTag(id: string) {
    return this.request<{ success: boolean }>(`/tags/${id}`, { method: 'DELETE' });
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

  // --- Admin (требует роль ADMIN на backend) ---
  adminStats() {
    return this.request<any>('/admin/stats');
  }

  adminUsers(params?: Record<string, string>) {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return this.request<{ users: any[]; total: number; page: number; pageSize: number }>(
      `/admin/users${query}`
    );
  }

  adminUser(id: string) {
    return this.request<any>(`/admin/users/${id}`);
  }

  adminRenameUser(id: string, name: string) {
    return this.request<{ user: any }>(`/admin/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    });
  }

  adminDeposit(id: string, amount: number, comment?: string) {
    return this.request<{ balance: number; transaction: any }>(`/admin/users/${id}/balance`, {
      method: 'POST',
      body: JSON.stringify({ amount, comment }),
    });
  }

  adminWithdraw(id: string, amount: number, comment?: string) {
    return this.request<{ balance: number; transaction: any }>(`/admin/users/${id}/withdraw`, {
      method: 'POST',
      body: JSON.stringify({ amount, comment }),
    });
  }

  adminSetPlan(id: string, data: { plan: string; startsAt?: string; endsAt?: string | null; price?: number }) {
    return this.request<{ user: any; subscription: any }>(`/admin/users/${id}/plan`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  adminBlock(id: string, reason?: string) {
    return this.request<{ ok: boolean }>(`/admin/users/${id}/block`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  }

  adminUnblock(id: string) {
    return this.request<{ ok: boolean }>(`/admin/users/${id}/unblock`, { method: 'POST' });
  }

  adminSetRole(id: string, role: string) {
    return this.request<{ ok: boolean; role: string }>(`/admin/users/${id}/role`, {
      method: 'POST',
      body: JSON.stringify({ role }),
    });
  }

  adminSubscriptions(params?: Record<string, string>) {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return this.request<{ subscriptions: any[]; total: number; page: number; pageSize: number; stats: any }>(
      `/admin/subscriptions${query}`
    );
  }

  adminTransactions(params?: Record<string, string>) {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return this.request<{ transactions: any[]; total: number; page: number; pageSize: number }>(
      `/admin/transactions${query}`
    );
  }

  adminRevenue() {
    return this.request<any>('/admin/revenue');
  }

  adminLogs(params?: Record<string, string>) {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return this.request<{ logs: any[]; total: number; page: number; pageSize: number }>(
      `/admin/logs${query}`
    );
  }

  adminSettings() {
    return this.request<any>('/admin/settings');
  }

  adminCreateUser(data: { email: string; password: string; name?: string }) {
    return this.request<{ user: any }>('/admin/users', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  adminDeleteUser(id: string) {
    return this.request<{ ok: boolean }>(`/admin/users/${id}`, { method: 'DELETE' });
  }

  adminSetPassword(id: string, password: string, confirmPassword: string) {
    return this.request<{ ok: boolean }>(`/admin/users/${id}/password`, {
      method: 'POST',
      body: JSON.stringify({ password, confirmPassword }),
    });
  }

  adminTasks(params?: Record<string, string>) {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return this.request<{ tasks: any[]; total: number; page: number; pageSize: number }>(
      `/admin/tasks${query}`
    );
  }

  adminTask(id: string) {
    return this.request<{ task: any }>(`/admin/tasks/${id}`);
  }

  adminUpdateTask(id: string, data: any) {
    return this.request<{ task: any }>(`/admin/tasks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  adminDeleteTask(id: string) {
    return this.request<{ ok: boolean }>(`/admin/tasks/${id}`, { method: 'DELETE' });
  }

  adminSearch(q: string) {
    return this.request<{ users: any[]; tasks: any[] }>(`/admin/search?q=${encodeURIComponent(q)}`);
  }

  adminImpersonate(id: string) {
    return this.request<{ ok: boolean; user: any }>(`/admin/users/${id}/impersonate`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  }

  adminErrors(params?: Record<string, string>) {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return this.request<{ errors: any[]; total: number; page: number; pageSize: number; unresolved: number }>(
      `/admin/errors${query}`
    );
  }

  adminResolveError(id: string, resolved: boolean) {
    return this.request<{ error: any }>(`/admin/errors/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ resolved }),
    });
  }

  adminSendNotification(data: { title: string; message: string; userIds?: string[]; all?: boolean }) {
    return this.request<{ ok: boolean; recipients: number }>('/admin/notifications', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  adminNotificationHistory(params?: Record<string, string>) {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return this.request<{ broadcasts: any[]; total: number; page: number; pageSize: number }>(
      `/admin/notifications${query}`
    );
  }

  adminFlags() {
    return this.request<{ flags: any[] }>('/admin/feature-flags');
  }

  adminSetFlag(key: string, enabled: boolean) {
    return this.request<{ flag: any }>(`/admin/feature-flags/${key}`, {
      method: 'PUT',
      body: JSON.stringify({ enabled }),
    });
  }

  adminMaintenance() {
    return this.request<{ enabled: boolean; message: string }>('/admin/system/maintenance');
  }

  adminSetMaintenance(enabled: boolean, message?: string) {
    return this.request<{ ok: boolean; enabled: boolean }>('/admin/system/maintenance', {
      method: 'POST',
      body: JSON.stringify({ enabled, message }),
    });
  }

  systemStatus() {
    return this.request<{ maintenance: { enabled: boolean; message: string } }>('/auth/system/status');
  }

  // --- Notes (одна задача = максимум одна заметка) ---
  getNotes() {
    return this.request<{
      notes: { id: string; taskId: string; taskTitle: string; preview: string; updatedAt: string }[];
    }>('/notes');
  }

  getNote(id: string) {
    return this.request<{ note: any }>(`/notes/${id}`);
  }

  getNoteByTask(taskId: string) {
    return this.request<{ note: any | null }>(`/notes/by-task/${taskId}`);
  }

  createNote(data: { taskId: string; content: string }) {
    return this.request<{ note: any }>('/notes', { method: 'POST', body: JSON.stringify(data) });
  }

  updateNote(id: string, content: string) {
    return this.request<{ note: any }>(`/notes/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ content }),
    });
  }

  deleteNote(id: string) {
    return this.request<{ success: boolean }>(`/notes/${id}`, { method: 'DELETE' });
  }
}

export const api = new ApiClient();
