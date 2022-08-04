import {ChangeDetectorRef, Component, OnDestroy, OnInit, QueryList, ViewChild, ViewChildren} from '@angular/core';
import {UntypedFormArray, UntypedFormBuilder, UntypedFormControl, UntypedFormGroup, NgForm, Validators} from '@angular/forms';
import {Subscription} from 'rxjs';
import {Marker, SettingInfo} from '@shared/info-objects/setting.info';
import {MarkersManageComponent} from '../markers-manage.component';
import {cloneDeep, filter, find, findIndex, indexOf, isNil, remove} from 'lodash';
import {uuidv4} from '../../../utils/utils';
import {CdkDrag, CdkDragDrop, CdkDragStart, CdkDropList} from '@angular/cdk/drag-drop';
import {MatDialogConfig} from '@angular/material/dialog';
import {
  YesAndNoConfirmationDialogComponent
} from '../../yes-and-no-confirmation-dialog/yes-and-no-confirmation-dialog.component';
import {AppService} from '../../../services/app.service';

function nameSort(a, b): number {
  return a.name.localeCompare(b.name);
}

export interface MarkerItem extends Marker {
  groupCount: number;
}

export interface GroupItem {
  groupId: string;
  name: string;
  members: Marker[];
  editing: boolean;
}

@Component({
  selector: 'pdf-marker-groups-tab',
  templateUrl: './groups-tab.component.html',
  styleUrls: ['./groups-tab.component.scss']
})
export class GroupsTabComponent implements OnInit, OnDestroy {
  isEditing = false;

  formGroup: UntypedFormGroup;

  /**
   * Reference to the marker form
   */
  @ViewChild('groupForm', {static: true})
  groupForm: NgForm;

  /**
   * Reference to the list of groups form array
   */
  groupsFormArray: UntypedFormArray;


  groupItems: GroupItem[] = [];

  markers: MarkerItem[] = [];

  @ViewChild(CdkDropList)
  cdkDropList: CdkDropList;

  @ViewChildren('membersList')
  groupDropLists: QueryList<CdkDropList>;

  activeGroupIndex;

  private settingsSubscription: Subscription;

  private originalSettings: SettingInfo;

  constructor(private markersManageComponent: MarkersManageComponent,
              private appService: AppService,
              private formBuilder: UntypedFormBuilder,
              private changeDetectorRef: ChangeDetectorRef) {
    this.initForm();
  }

  private initForm() {
    this.formGroup = this.formBuilder.group({
      groupName: [null, Validators.compose([Validators.required, Validators.maxLength(50), Validators.pattern('^(\\w+\\.?\\_?\\-?\\s?\\d?)*\\w+$')])]
    });

    this.groupsFormArray = this.formBuilder.array([]);
  }

  ngOnInit(): void {
    this.settingsSubscription = this.markersManageComponent.settingsLoaded.subscribe((settings) => {
      this.originalSettings = settings;
      this.populateExpansions();
    });
  }

  ngOnDestroy() {
    this.settingsSubscription.unsubscribe();
  }

  private populateExpansions(): void {
    if (!isNil(this.originalSettings.groups)) {
      this.groupItems = this.originalSettings.groups
        .sort(nameSort)
        .map((group) => {
        const groupItem: GroupItem = {
          groupId: group.id,
          name: group.name,
          members: [],
          editing: false
        };

        if (!isNil(this.originalSettings.groupMembers)) {
          groupItem.members = this.originalSettings.groupMembers
            .filter((gm) => gm.groupId === groupItem.groupId)
            .map((gm) => {
              return find(this.originalSettings.markers, {id: gm.markerId});
            })
            .sort(nameSort);
        }

        return groupItem;
      });

      this.groupsFormArray.clear();
      this.originalSettings.groups.forEach((group) => {
        this.groupsFormArray.push(this.formBuilder.group({
          id: [group.id],
          name: [group.name, Validators.compose([Validators.required, Validators.maxLength(50), Validators.pattern('^(\\w+\\.?\\_?\\-?\\s?\\d?)*\\w+$')])],
        }), {emitEvent: false});
      });
      this.groupsFormArray.updateValueAndValidity();
    }

    if (!isNil(this.originalSettings.markers)) {
      this.markers = this.originalSettings.markers.map((marker) => {
        return {
          ...marker,
          groupCount : filter(this.originalSettings.groupMembers, {markerId: marker.id}).length
        };
      })
        .sort(nameSort);
    }


  }

  addGroup(): void {
    const settings = cloneDeep(this.originalSettings);
    if (isNil(settings.groups)) {
      settings.groups = [];
    }
    const id = uuidv4();
    settings.groups.push({
      id,
      name: this.formGroup.value.groupName
    });
    this.markersManageComponent.saveSettings(settings).subscribe({
      next: () => {
        this.isEditing = false;
        this.formGroup.reset();
        this.groupForm.resetForm();
        // Determine the index of the new group
        this.activeGroupIndex = findIndex(settings.groups.sort(nameSort), {id});
        this.changeDetectorRef.detectChanges();
      },
      error: () => {

      }
    });

  }

  private addToGroup(markerId: string, groupId: string) {
    const settings = cloneDeep(this.originalSettings);
    if (isNil(settings.groupMembers)) {
      settings.groupMembers = [];
    }
    settings.groupMembers.push({
      markerId,
      groupId
    });
    this.markersManageComponent.saveSettings(settings).subscribe({
      next: () => {
      },
      error: () => {

      }
    });
  }

  private removeFromGroup(markerId: string, groupId: string) {
    const settings = cloneDeep(this.originalSettings);
    if (isNil(settings.groupMembers)) {
      settings.groupMembers = [];
    }
    remove(settings.groupMembers, (gm) => {
      return gm.groupId === groupId && gm.markerId === markerId;
    });
    this.markersManageComponent.saveSettings(settings).subscribe({
      next: () => {
      },
      error: () => {

      }
    });
  }

  cancelAddGroup() {
    this.formGroup.reset();
    this.isEditing = false;
  }

  removeMember(event: CdkDragDrop<Marker[]>) {
    if (event.previousContainer === event.container) {
      // Nothing to do if dropped in same container
      return;
    }
    const member = event.item.data;
    const group = this.groupItems[this.activeGroupIndex];
    this.removeFromGroup(member.id, group.groupId);
  }

  canAddMember = (drag: CdkDrag<MarkerItem>, drop: CdkDropList<MarkerItem[]>) => {
    const groupMember = drag.data;
    const group = this.groupItems[this.activeGroupIndex];
    const existingMember = find(group.members, {id: groupMember.id});
    return isNil(existingMember);
  }

  addMember(event: CdkDragDrop<Marker[]>) {
    if (event.previousContainer === event.container) {
      // Nothing to do if dropped in same container
      return;
    }
    const member = event.item.data;
    const group = this.groupItems[this.activeGroupIndex];
    this.addToGroup(member.id, group.groupId);
  }

  groupExpanded(expanded: boolean, index: number) {
    if (expanded) {
      this.activeGroupIndex = index;
    }
  }

  deleteGroup(event, groupItem: GroupItem) {
    event.stopImmediatePropagation();
    const config = new MatDialogConfig();
    config.width = '400px';
    config.maxWidth = '400px';
    config.data = {
      title: 'Delete group',
      message: `Are you sure you want to delete group ${groupItem.name}?`,
    };
    this.appService.createDialog(YesAndNoConfirmationDialogComponent, config, (accepted) => {
      if (accepted) {
        this.activeGroupIndex = undefined;
        const updateSettings = cloneDeep(this.originalSettings);
        remove(updateSettings.groups, (g) => g.id === groupItem.groupId);
        remove(updateSettings.groupMembers, (gm) => gm.groupId === groupItem.groupId);

        this.markersManageComponent.saveSettings(updateSettings).subscribe(({
          next: () => {

          },
          error: () => {

          }
        }));
      }
    });
  }

  /**
   * Get a marker form control from the array
   * @param index
   * @param name
   */
  getFormControl(index: number, name: string): UntypedFormControl {
    return this.groupsFormArray.at(index).get(name) as UntypedFormControl;
  }

  editGroup($event: MouseEvent, groupItem: GroupItem) {
    $event.stopImmediatePropagation();
    groupItem.editing = true;
  }

  cancelEdit($event: MouseEvent, $index: number, groupItem: GroupItem) {
    $event.stopImmediatePropagation();
    this.getFormControl($index, 'name').reset(groupItem.name);
    groupItem.editing = false;
  }

  updateGroupKeypress($event: KeyboardEvent, index: number, groupItem: GroupItem) {
    $event.stopImmediatePropagation();
    this.updateGroup(index, groupItem);
  }
  updateGroupClick($event: MouseEvent, index: number, groupItem: GroupItem) {
    $event.stopImmediatePropagation();
    this.updateGroup(index, groupItem);
  }

  updateGroup(index: number, groupItem: GroupItem) {
    const formValue = this.getFormControl(index, 'name').value;
    const updateSettings = cloneDeep(this.originalSettings);
    const group = find(updateSettings.groups, {id: groupItem.groupId});
    group.name = formValue;

    this.markersManageComponent.saveSettings(updateSettings).subscribe({
      next: () => {

      },
      error: () => {

      }
    });
  }
}