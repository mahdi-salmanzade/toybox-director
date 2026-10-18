import test from 'node:test';
import assert from 'node:assert/strict';
import { interpolatePose, makeProject, makeShot, parseProject } from '../src/lib/project.ts';
import { filmExportMetadata, guideSource, prepareFrameExport, shotRenderMetadata, studioShortcut } from '../src/lib/studio-controls.ts';

const context = {busy:false, dialog:null, textEntry:false, interactive:false, stageVisible:true};
const key = (values: Partial<Parameters<typeof studioShortcut>[0]>) => ({key:'',code:'',metaKey:false,ctrlKey:false,shiftKey:false,altKey:false,defaultPrevented:false,...values});

test('frame export freezes the scrubbed pose instead of the selected keyframe or its photo', () => {
  const shot=makeShot();
  shot.frames[0].image='data:image/jpeg;base64,cGhvdG8=';
  const prop=shot.props[0].id;
  const source=prepareFrameExport(shot,0,.25);
  assert.equal(source.image,undefined, 'the paused stage is visible even when the selected keyframe has a photo');
  assert.equal(source.time,.25);
  assert.equal(interpolatePose(source.shot,prop,source.time!).x,-1.8);
  assert.notEqual(interpolatePose(source.shot,prop,source.time!).x,shot.frames[0].poses[prop].x);
  shot.frames[1].poses[prop].x=5;
  assert.equal(interpolatePose(source.shot,prop,source.time!).x,-1.8, 'later edits cannot change a capture in flight');
});

test('a playback time of zero is a stage frame; only an explicitly selected photo exports the photo', () => {
  const shot=makeShot();
  shot.frames[0].image='data:image/jpeg;base64,cGhvdG8=';
  assert.equal(prepareFrameExport(shot,0,0).image,undefined);
  assert.equal(prepareFrameExport(shot,0,0).time,0);
  assert.equal(prepareFrameExport(shot,0,null).image,shot.frames[0].image);
  assert.equal(prepareFrameExport(shot,1,null).image,undefined);
  assert.equal(prepareFrameExport(shot,1,null).frameIndex,1);
});

test('undo and uppercase Shift+Z redo work after a toolbar button keeps keyboard focus', () => {
  const button={...context,interactive:true};
  assert.deepEqual(studioShortcut(key({key:'z',code:'KeyZ',metaKey:true}),button),{kind:'undo'});
  assert.deepEqual(studioShortcut(key({key:'Z',code:'KeyZ',metaKey:true,shiftKey:true}),button),{kind:'redo'});
  assert.deepEqual(studioShortcut(key({key:'Z',code:'KeyZ',ctrlKey:true,shiftKey:true}),context),{kind:'redo'});
});

test('project save works in title fields and Share while native text undo remains available', () => {
  const input={...context,textEntry:true,interactive:true};
  assert.deepEqual(studioShortcut(key({key:'s',metaKey:true}),input),{kind:'save'});
  assert.deepEqual(studioShortcut(key({key:'s',ctrlKey:true}),{...input,dialog:'export'}),{kind:'save'});
  assert.equal(studioShortcut(key({key:'z',metaKey:true}),input),null);
  assert.equal(studioShortcut(key({key:'Z',ctrlKey:true,shiftKey:true}),input),null);
});

test('native button and media playback keys are not stolen by the stage', () => {
  const space=key({key:' ',code:'Space'});
  assert.equal(studioShortcut(space,{...context,interactive:true}),null);
  assert.equal(studioShortcut(space,{...context,stageVisible:false}),null);
  assert.deepEqual(studioShortcut(space,context),{kind:'play'});
  assert.equal(studioShortcut(key({key:'1',ctrlKey:true}),context),null,'browser tab shortcuts stay native');
  assert.deepEqual(studioShortcut(key({key:'2'}),context),{kind:'frame',index:1});
});

test('busy states, unrelated dialogs, and already handled events suppress studio shortcuts', () => {
  const save=key({key:'s',metaKey:true});
  assert.equal(studioShortcut(save,{...context,busy:true}),null);
  assert.equal(studioShortcut(save,{...context,dialog:'connection'}),null);
  assert.equal(studioShortcut({...save,defaultPrevented:true},context),null);
  assert.equal(studioShortcut(key({key:'z',metaKey:true}),{...context,dialog:'export'}),null);
});

test('valid imported identities stay exact while blank or control-character display names render safely', () => {
  const project=makeProject();
  project.id=' project\nidentity ';
  project.name=' \t\n';
  const shot=project.shots[0];
  shot.id='scene\u0000identity'; project.activeShotId=shot.id;
  shot.name=' Arrival\n\tAt midnight ';
  const restored=parseProject(JSON.stringify(project));
  const before=JSON.stringify(restored);
  const metadata=shotRenderMetadata(restored.shots[0],restored);
  assert.equal(metadata.projectId,project.id);
  assert.equal(metadata.shotId,shot.id);
  assert.equal(metadata.projectName,'Untitled project');
  assert.equal(metadata.shotName,'Arrival  At midnight');
  assert.deepEqual(filmExportMetadata(restored),{title:'Untitled film',projectId:project.id,projectName:'Untitled project'});
  assert.equal(JSON.stringify(restored),before,'formatting metadata must not rewrite authored names or IDs');
});

test('full-length imported project names retain their saved text and fit film title limits', () => {
  const project=makeProject(); project.name='x'.repeat(200); project.shots[0].name='';
  const metadata=filmExportMetadata(project);
  assert.equal(metadata.title.length,160);
  assert.equal(metadata.projectName.length,200);
  assert.equal(project.name.length,200);
  assert.equal(shotRenderMetadata(project.shots[0],project).shotName,'Untitled scene');
});

test('guide frames use keyframe photos, stage captures at their time, and never mix a photo opening with the stage world', () => {
  const shot = makeShot();
  assert.deepEqual(guideSource(shot, .5), {kind: 'stage', frameIndex: 1, time: .5});
  assert.deepEqual(guideSource(shot, 1), {kind: 'stage', frameIndex: 2, time: 1});
  assert.deepEqual(guideSource(shot, .75), {kind: 'stage', frameIndex: 2, time: .75});
  shot.frames[2].image = 'data:image/png;base64,AAAA';
  assert.deepEqual(guideSource(shot, 1), {kind: 'photo', image: shot.frames[2].image});
  shot.frames[0].image = 'data:image/jpeg;base64,BBBB';
  assert.deepEqual(guideSource(shot, .5), {kind: 'skip'});
  assert.deepEqual(guideSource(shot, 1), {kind: 'photo', image: shot.frames[2].image});
});
