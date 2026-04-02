import fs from 'fs';
import path from 'path';
import { getDataPath } from '../init.js';
import { ImportRepository } from '../../repositories/ImportRepository.js';
import { getPersonIdsInScope, gatherExportData, generateGedcom551, type ExportScope } from './exporter551.js';
import { generateGedcom70 } from './exporter70.js';
import type { ExportJob } from '../../types/db.js';

export interface ExportOptions {
  userId: string;
  gedcomVersion: ExportJob['gedcom_version'];
  scope: ExportJob['scope'];
  mediaOption: ExportJob['media_option'];
  scopePersonId?: string;
  scopeStartDate?: string;
  scopeEndDate?: string;
}

export function startExport(options: ExportOptions): ExportJob {
  const importRepo = new ImportRepository();

  const job = importRepo.createExportJob({
    user_id: options.userId,
    gedcom_version: options.gedcomVersion,
    scope: options.scope,
    media_option: options.mediaOption,
    scope_person_id: options.scopePersonId,
    scope_start_date: options.scopeStartDate,
    scope_end_date: options.scopeEndDate,
  });

  // Process synchronously (fine for SQLite)
  try {
    importRepo.updateExportStatus(job.id, 'processing');

    const scopeOpts: ExportScope = {
      scope: options.scope,
      personId: options.scopePersonId,
      startDate: options.scopeStartDate,
      endDate: options.scopeEndDate,
    };

    const personIds = getPersonIdsInScope(scopeOpts);
    const data = gatherExportData(personIds);

    const gedcomContent = options.gedcomVersion === '7.0'
      ? generateGedcom70(data)
      : generateGedcom551(data);

    const exportsDir = getDataPath('exports');
    if (!fs.existsSync(exportsDir)) {
      fs.mkdirSync(exportsDir, { recursive: true });
    }

    const filename = `export_${job.id}.ged`;
    const filePath = path.join(exportsDir, filename);
    fs.writeFileSync(filePath, gedcomContent, 'utf-8');

    const totalRecords = data.persons.length + data.families.length + data.sources.length + data.repositories.length;

    importRepo.updateExportStatus(job.id, 'completed', {
      file_path: filePath,
      total_records: totalRecords,
    });

    return importRepo.findExportById(job.id)!;
  } catch (err) {
    importRepo.updateExportStatus(job.id, 'failed', {
      error_message: String(err),
    });
    throw err;
  }
}
