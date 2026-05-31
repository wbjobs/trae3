// 文本差异对比组件

import {
  Component,
  OnInit,
  Input,
  OnChanges,
  SimpleChanges,
  signal,
  computed,
  inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { TextDiff } from '../../../../core/models/collation.model';
import { CollationService } from '../../services/collation.service';

@Component({
  selector: 'app-text-diff',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './text-diff.component.html',
  styleUrls: ['./text-diff.component.scss']
})
export class TextDiffComponent implements OnInit, OnChanges {
  private readonly collationService = inject(CollationService);

  @Input() oldText = '';
  @Input() newText = '';
  @Input() diffs: TextDiff[] = [];
  @Input() diffMode: 'chars' | 'words' | 'lines' = 'chars';
  @Input() showInline = true;
  @Input() showSideBySide = false;

  readonly internalDiffs = signal<TextDiff[]>([]);
  readonly leftDiffs = signal<TextDiff[]>([]);
  readonly rightDiffs = signal<TextDiff[]>([]);

  readonly hasDiffs = computed(() => {
    const diffsToCheck = this.diffs.length > 0 ? this.diffs : this.internalDiffs();
    return diffsToCheck.some((d) => d.type !== 'unchanged');
  });

  readonly addedCount = computed(() => {
    const diffsToCheck = this.diffs.length > 0 ? this.diffs : this.internalDiffs();
    return diffsToCheck
      .filter((d) => d.type === 'added')
      .reduce((sum, d) => sum + (d.count || d.value.length), 0);
  });

  readonly removedCount = computed(() => {
    const diffsToCheck = this.diffs.length > 0 ? this.diffs : this.internalDiffs();
    return diffsToCheck
      .filter((d) => d.type === 'removed')
      .reduce((sum, d) => sum + (d.count || d.value.length), 0);
  });

  ngOnInit(): void {
    this.computeDiffs();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['oldText'] || changes['newText'] || changes['diffMode']) {
      if (this.diffs.length === 0) {
        this.computeDiffs();
      }
    }
    if (changes['diffs'] && this.diffs.length > 0) {
      this.internalDiffs.set(this.diffs);
      this.computeSideBySideDiffs();
    }
  }

  /**
   * 计算差异
   */
  private computeDiffs(): void {
    if (!this.oldText && !this.newText) {
      this.internalDiffs.set([]);
      this.leftDiffs.set([]);
      this.rightDiffs.set([]);
      return;
    }

    let diffs: TextDiff[] = [];

    switch (this.diffMode) {
      case 'chars':
        diffs = this.collationService.computeTextDiff(this.oldText, this.newText);
        break;
      case 'words':
        diffs = this.collationService.computeWordDiff(this.oldText, this.newText);
        break;
      case 'lines':
        diffs = this.collationService.computeLineDiff(this.oldText, this.newText);
        break;
    }

    this.internalDiffs.set(diffs);
    this.computeSideBySideDiffs();
  }

  /**
   * 计算并排显示的差异
   */
  private computeSideBySideDiffs(): void {
    const diffs = this.diffs.length > 0 ? this.diffs : this.internalDiffs();

    const left: TextDiff[] = [];
    const right: TextDiff[] = [];

    for (const diff of diffs) {
      if (diff.type === 'added') {
        right.push(diff);
      } else if (diff.type === 'removed') {
        left.push(diff);
      } else {
        left.push(diff);
        right.push(diff);
      }
    }

    this.leftDiffs.set(left);
    this.rightDiffs.set(right);
  }

  /**
   * 获取当前要显示的差异数组
   */
  getCurrentDiffs(): TextDiff[] {
    return this.diffs.length > 0 ? this.diffs : this.internalDiffs();
  }

  /**
   * 获取差异类型的CSS类
   */
  getDiffClass(type: string): string {
    switch (type) {
      case 'added':
        return 'diff-added';
      case 'removed':
        return 'diff-removed';
      default:
        return 'diff-unchanged';
    }
  }

  /**
   * 处理换行符显示
   */
  formatText(text: string): string {
    return text.replace(/\n/g, '↵\n');
  }

  /**
   * HTML转义
   */
  escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * 获取转义并格式化后的文本
   */
  getSafeHtml(text: string): string {
    return this.escapeHtml(this.formatText(text));
  }

  /**
   * 切换对比模式
   */
  setDiffMode(mode: 'chars' | 'words' | 'lines'): void {
    this.diffMode = mode;
    this.computeDiffs();
  }
}
