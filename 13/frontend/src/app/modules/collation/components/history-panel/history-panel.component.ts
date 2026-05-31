// 历史记录面板组件

import {
  Component,
  OnInit,
  Input,
  Output,
  EventEmitter,
  signal,
  computed,
  inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { CollationRecord, TextDiff } from '../../../../core/models/collation.model';
import { CollationService } from '../../services/collation.service';
import { TextDiffComponent } from '../text-diff/text-diff.component';

@Component({
  selector: 'app-history-panel',
  standalone: true,
  imports: [CommonModule, TextDiffComponent],
  templateUrl: './history-panel.component.html',
  styleUrls: ['./history-panel.component.scss']
})
export class HistoryPanelComponent implements OnInit {
  private readonly collationService = inject(CollationService);

  @Input() history: CollationRecord[] = [];
  @Input() currentPageId = '';

  @Output() restore = new EventEmitter<CollationRecord>();
  @Output() close = new EventEmitter<void>();

  readonly selectedRecord = signal<CollationRecord | null>(null);
  readonly compareMode = signal(false);
  readonly selectedVersion1 = signal<number | null>(null);
  readonly selectedVersion2 = signal<number | null>(null);
  readonly diffResult = signal<TextDiff[]>([]);
  readonly isLoading = signal(false);

  readonly sortedHistory = computed(() =>
    [...this.history].sort((a, b) => b.version - a.version)
  );

  readonly canCompare = computed(() =>
    this.selectedVersion1() !== null &&
    this.selectedVersion2() !== null &&
    this.selectedVersion1() !== this.selectedVersion2()
  );

  ngOnInit(): void {}

  /**
   * 选择记录查看详情
   */
  selectRecord(record: CollationRecord): void {
    if (!this.compareMode()) {
      this.selectedRecord.set(record);
    }
  }

  /**
   * 切换对比模式
   */
  toggleCompareMode(): void {
    this.compareMode.update((v) => !v);
    this.selectedRecord.set(null);
    this.selectedVersion1.set(null);
    this.selectedVersion2.set(null);
    this.diffResult.set([]);
  }

  /**
   * 选择版本进行对比
   */
  selectVersion(version: number): void {
    if (!this.compareMode()) return;

    if (this.selectedVersion1() === null) {
      this.selectedVersion1.set(version);
    } else if (this.selectedVersion2() === null) {
      if (this.selectedVersion1() === version) {
        this.selectedVersion1.set(null);
      } else {
        this.selectedVersion2.set(version);
      }
    } else {
      this.selectedVersion1.set(version);
      this.selectedVersion2.set(null);
    }
  }

  /**
   * 执行版本对比
   */
  async compareVersions(): Promise<void> {
    const v1 = this.selectedVersion1();
    const v2 = this.selectedVersion2();

    if (v1 === null || v2 === null) return;

    const record1 = this.history.find((r) => r.version === v1);
    const record2 = this.history.find((r) => r.version === v2);

    if (!record1 || !record2) return;

    this.isLoading.set(true);

    try {
      const older = v1 < v2 ? record1 : record2;
      const newer = v1 < v2 ? record2 : record1;

      const diffs = this.collationService.computeTextDiff(
        older.correctedText,
        newer.correctedText
      );

      this.diffResult.set(diffs);
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * 恢复到指定版本
   */
  restoreVersion(record: CollationRecord): void {
    if (confirm(`确定要恢复到版本 v${record.version} 吗？`)) {
      this.restore.emit(record);
      this.close.emit();
    }
  }

  /**
   * 关闭面板
   */
  closePanel(): void {
    this.close.emit();
  }

  /**
   * 格式化日期
   */
  formatDate(date: Date): string {
    const d = new Date(date);
    return d.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  /**
   * 获取版本选择状态
   */
  getVersionSelectionClass(version: number): string {
    if (this.selectedVersion1() === version) {
      return 'selected-v1';
    }
    if (this.selectedVersion2() === version) {
      return 'selected-v2';
    }
    return '';
  }

  /**
   * 清空对比选择
   */
  clearComparison(): void {
    this.selectedVersion1.set(null);
    this.selectedVersion2.set(null);
    this.diffResult.set([]);
  }
}
