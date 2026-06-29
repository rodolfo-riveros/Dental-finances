import { databases, storage, ID, Permission, Role } from './appwrite';

const DATABASE_ID = import.meta.env.PUBLIC_APPWRITE_DATABASE_ID;
const TREATMENTS_COLLECTION_ID = import.meta.env.PUBLIC_TREATMENTS_COLLECTION_ID;
const EXPENSES_COLLECTION_ID = import.meta.env.PUBLIC_EXPENSES_COLLECTION_ID;
const DEBTS_COLLECTION_ID = import.meta.env.PUBLIC_DEBTS_COLLECTION_ID;
const SERVICES_COLLECTION_ID = import.meta.env.PUBLIC_SERVICES_COLLECTION_ID;
const CLINICS_COLLECTION_ID = import.meta.env.PUBLIC_CLINICS_COLLECTION_ID;
const BUCKET_ID = import.meta.env.PUBLIC_APPWRITE_BUCKET_ID || '';

function monthFromDate(dateStr: string): number {
  if (!dateStr) return new Date().getMonth();
  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) return d.getMonth();
  const months: Record<string, number> = { ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5, jul: 6, ago: 7, sep: 8, oct: 9, nov: 10, dic: 11 };
  const match = dateStr.toLowerCase().match(/(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)/);
  if (match && match[1] in months) return months[match[1]];
  return new Date().getMonth();
}

export async function fetchMonthlyData(monthIdx: number): Promise<{
  ganancia: number; gastos: number; deudas: number; clinica: number; externo: number;
} | null> {
  try {
    const [treatmentsRes, expensesRes, debtsRes] = await Promise.all([
      databases.listDocuments(DATABASE_ID, TREATMENTS_COLLECTION_ID),
      databases.listDocuments(DATABASE_ID, EXPENSES_COLLECTION_ID),
      databases.listDocuments(DATABASE_ID, DEBTS_COLLECTION_ID),
    ]);

    let clinica = 0, externo = 0, gastos = 0, deudas = 0;

    for (const t of treatmentsRes.documents) {
      const m = monthFromDate(t.date || t.$createdAt);
      if (m !== monthIdx) continue;
      const total = Number(t.total) || 0;
      if (t.source === 'Clínica') clinica += total;
      else externo += total;
    }

    for (const e of expensesRes.documents) {
      const m = monthFromDate(e.date || e.$createdAt);
      if (m !== monthIdx) continue;
      gastos += Number(e.amount) || 0;
    }

    for (const d of debtsRes.documents) {
      const m = monthFromDate(d.dueDate || d.date || d.$createdAt);
      if (m !== monthIdx) continue;
      deudas += Number(d.amount) || 0;
    }

    return { ganancia: clinica + externo, gastos, deudas, clinica, externo };
  } catch (err) {
    console.warn('Appwrite data fetch failed, using fallback:', err);
    return null;
  }
}

export async function fetchExpenses(): Promise<any[]> {
  const res = await databases.listDocuments(DATABASE_ID, EXPENSES_COLLECTION_ID);
  return res.documents;
}

export async function addExpense(data: { description: string; category: string; amount: number; date: string; voucher?: string }): Promise<any> {
  const payload: Record<string, any> = {
    description: data.description,
    category: data.category,
    amount: data.amount,
    date: data.date,
  };
  if (data.voucher) payload.voucher = data.voucher;
  try {
    return await databases.createDocument(DATABASE_ID, EXPENSES_COLLECTION_ID, ID.unique(), payload);
  } catch (err: any) {
    if (data.voucher && (err?.message?.includes('Unknown attribute') || err?.message?.includes('not found') || err?.message?.includes('not defined'))) {
      delete payload.voucher;
      return databases.createDocument(DATABASE_ID, EXPENSES_COLLECTION_ID, ID.unique(), payload);
    }
    throw err;
  }
}

export async function updateExpense(id: string, data: { description?: string; category?: string; amount?: number; date?: string; voucher?: string }): Promise<any> {
  return databases.updateDocument(DATABASE_ID, EXPENSES_COLLECTION_ID, id, data);
}

export async function deleteExpense(id: string): Promise<void> {
  await databases.deleteDocument(DATABASE_ID, EXPENSES_COLLECTION_ID, id);
}

export async function fetchTreatments(): Promise<any[]> {
  const res = await databases.listDocuments(DATABASE_ID, TREATMENTS_COLLECTION_ID);
  return res.documents;
}

export async function addTreatment(data: {
  patient: string; type: string; source: string; date: string;
  total: number; paid: number; balance: number;
  costLab?: number; costTech?: number; costOther?: number;
  voucher?: string;
}): Promise<any> {
  const payload: Record<string, any> = {
    patient: data.patient, type: data.type, source: data.source, date: data.date,
    total: data.total, paid: data.paid, balance: data.balance,
    costLab: data.costLab || 0, costTech: data.costTech || 0, costOther: data.costOther || 0,
  };
  if (data.voucher) payload.voucher = data.voucher;
  try {
    return await databases.createDocument(DATABASE_ID, TREATMENTS_COLLECTION_ID, ID.unique(), payload);
  } catch (err: any) {
    if (data.voucher && (err?.message?.includes('Unknown attribute') || err?.message?.includes('not found'))) {
      delete payload.voucher;
      return databases.createDocument(DATABASE_ID, TREATMENTS_COLLECTION_ID, ID.unique(), payload);
    }
    throw err;
  }
}

export async function updateTreatment(id: string, data: {
  patient?: string; type?: string; source?: string; date?: string;
  total?: number; paid?: number; balance?: number;
  costLab?: number; costTech?: number; costOther?: number;
  voucher?: string;
}): Promise<any> {
  return databases.updateDocument(DATABASE_ID, TREATMENTS_COLLECTION_ID, id, data);
}

export async function deleteTreatment(id: string): Promise<void> {
  await databases.deleteDocument(DATABASE_ID, TREATMENTS_COLLECTION_ID, id);
}

export async function deleteTreatmentWithVoucher(id: string, voucherFileId?: string): Promise<void> {
  if (voucherFileId && BUCKET_ID) {
    try {
      await storage.deleteFile(BUCKET_ID, voucherFileId);
    } catch (err) {
      console.warn('Error deleting voucher file from storage:', err);
    }
  }
  await databases.deleteDocument(DATABASE_ID, TREATMENTS_COLLECTION_ID, id);
}

export async function deleteExpenseWithVoucher(id: string, voucherFileId?: string): Promise<void> {
  if (voucherFileId && BUCKET_ID) {
    try {
      await storage.deleteFile(BUCKET_ID, voucherFileId);
    } catch (err) {
      console.warn('Error deleting voucher file from storage:', err);
    }
  }
  await databases.deleteDocument(DATABASE_ID, EXPENSES_COLLECTION_ID, id);
}

export async function uploadVoucher(file: File): Promise<string> {
  if (!BUCKET_ID) throw new Error('PUBLIC_APPWRITE_BUCKET_ID not configured');
  const res = await storage.createFile(BUCKET_ID, ID.unique(), file, [
    Permission.read(Role.any()),
  ]);
  return res.$id;
}

export function getVoucherPreview(fileId: string): string {
  if (!BUCKET_ID) return '';
  return import.meta.env.PUBLIC_APPWRITE_ENDPOINT + '/storage/buckets/' + BUCKET_ID + '/files/' + fileId + '/view?project=' + import.meta.env.PUBLIC_APPWRITE_PROJECT_ID;
}

export async function deleteOldVouchers(years: number = 2): Promise<{ deleted: number; errors: number }> {
  let deleted = 0, errors = 0;
  if (!BUCKET_ID) return { deleted, errors };
  try {
    const res = await databases.listDocuments(DATABASE_ID, EXPENSES_COLLECTION_ID);
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - years);
    for (const doc of res.documents) {
      if (!doc.voucher) continue;
      const expenseDate = new Date(doc.date || doc.$createdAt);
      if (isNaN(expenseDate.getTime()) || expenseDate >= cutoff) continue;
      try {
        await storage.deleteFile(BUCKET_ID, doc.voucher);
        deleted++;
      } catch (e) {
        errors++;
        console.warn('Failed to delete voucher file:', doc.voucher, e);
      }
    }
  } catch (e) {
    console.error('Error listing expenses for cleanup:', e);
  }
  return { deleted, errors };
}

export async function fetchDebts(): Promise<any[]> {
  const res = await databases.listDocuments(DATABASE_ID, DEBTS_COLLECTION_ID);
  return res.documents;
}

export async function addDebt(data: {
  patient: string; description: string; amount: number; dueDate: string; source: string; status?: string; voucher?: string;
}): Promise<any> {
  const payload: Record<string, any> = {
    patient: data.patient, description: data.description, amount: data.amount, dueDate: data.dueDate, source: data.source, status: data.status || 'Pendiente',
  };
  if (data.voucher) payload.voucher = data.voucher;
  try {
    return await databases.createDocument(DATABASE_ID, DEBTS_COLLECTION_ID, ID.unique(), payload);
  } catch (err: any) {
    if (data.voucher && (err?.message?.includes('Unknown attribute') || err?.message?.includes('not found'))) {
      delete payload.voucher;
      return databases.createDocument(DATABASE_ID, DEBTS_COLLECTION_ID, ID.unique(), payload);
    }
    throw err;
  }
}

export async function updateDebt(id: string, data: {
  patient?: string; description?: string; amount?: number; dueDate?: string; source?: string; status?: string; voucher?: string;
}): Promise<any> {
  return databases.updateDocument(DATABASE_ID, DEBTS_COLLECTION_ID, id, data);
}

export async function deleteDebt(id: string): Promise<void> {
  await databases.deleteDocument(DATABASE_ID, DEBTS_COLLECTION_ID, id);
}

export async function deleteDebtWithVoucher(id: string, voucherFileId?: string): Promise<void> {
  if (voucherFileId && BUCKET_ID) {
    try {
      await storage.deleteFile(BUCKET_ID, voucherFileId);
    } catch (err) {
      console.warn('Error deleting voucher file from storage:', err);
    }
  }
  await databases.deleteDocument(DATABASE_ID, DEBTS_COLLECTION_ID, id);
}

// --- Services ---
export async function fetchServices(): Promise<any[]> {
  if (!SERVICES_COLLECTION_ID) return [];
  const res = await databases.listDocuments(DATABASE_ID, SERVICES_COLLECTION_ID);
  return res.documents;
}

export async function addService(data: {
  title: string; desc: string; price: number; category: string; color: string;
}): Promise<any> {
  return databases.createDocument(DATABASE_ID, SERVICES_COLLECTION_ID, ID.unique(), data);
}

export async function updateService(id: string, data: {
  title?: string; desc?: string; price?: number; category?: string; color?: string;
}): Promise<any> {
  return databases.updateDocument(DATABASE_ID, SERVICES_COLLECTION_ID, id, data);
}

export async function deleteService(id: string): Promise<void> {
  await databases.deleteDocument(DATABASE_ID, SERVICES_COLLECTION_ID, id);
}

// --- Clinics ---
export async function fetchClinic(): Promise<any> {
  if (!CLINICS_COLLECTION_ID) return null;
  const res = await databases.listDocuments(DATABASE_ID, CLINICS_COLLECTION_ID);
  return res.documents[0] || null;
}

export async function saveClinic(data: { name: string; email?: string }): Promise<any> {
  const existing = await fetchClinic();
  if (existing) {
    return databases.updateDocument(DATABASE_ID, CLINICS_COLLECTION_ID, existing.$id, data);
  }
  return databases.createDocument(DATABASE_ID, CLINICS_COLLECTION_ID, ID.unique(), data);
}

export async function fetchAllMonthlyData(): Promise<Record<string, { ganancia: number; gastos: number; deudas: number; clinica: number; externo: number }>> {
  try {
    const [treatmentsRes, expensesRes, debtsRes] = await Promise.all([
      databases.listDocuments(DATABASE_ID, TREATMENTS_COLLECTION_ID),
      databases.listDocuments(DATABASE_ID, EXPENSES_COLLECTION_ID),
      databases.listDocuments(DATABASE_ID, DEBTS_COLLECTION_ID),
    ]);

    const data: Record<string, any> = {};
    for (let i = 0; i < 12; i++) data[String(i)] = { ganancia: 0, gastos: 0, deudas: 0, clinica: 0, externo: 0, deudaCount: 0 };

    for (const t of treatmentsRes.documents) {
      const m = monthFromDate(t.date || t.$createdAt);
      const total = Number(t.total) || 0;
      data[String(m)].ganancia += total;
      if (t.source === 'Clínica') data[String(m)].clinica += total;
      else data[String(m)].externo += total;
    }

    for (const e of expensesRes.documents) {
      const m = monthFromDate(e.date || e.$createdAt);
      data[String(m)].gastos += Number(e.amount) || 0;
    }

    for (const d of debtsRes.documents) {
      const isPending = d.status !== 'Pagado' && d.status !== 'Cancelled';
      if (!isPending) continue;
      const m = monthFromDate(d.dueDate || d.date || d.$createdAt);
      data[String(m)].deudas += Number(d.amount) || 0;
      data[String(m)].deudaCount += 1;
    }

    return data;
  } catch (err) {
    console.warn('Appwrite data fetch failed:', err);
    return {};
  }
}


