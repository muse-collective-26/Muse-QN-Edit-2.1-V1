"""Local RefMod dataset mode: two sheets, reviewed crops, separate portrait outputs."""
import hashlib
import json
import logging
import uuid
from collections import OrderedDict
from pathlib import Path

import torch

SESSIONS = OrderedDict()
LABELS = {
    'portraits': ['Portrait front', 'Portrait left three-quarter', 'Portrait right three-quarter', 'Portrait profile'],
    'full_body': ['Full body front', 'Full body three-quarter', 'Full body profile', 'Full body rear'],
}

def split_grid(image):
    if image.ndim != 4 or image.shape[0] != 1:
        raise ValueError('Dataset sheet must contain exactly one image.')
    h, w = image.shape[1:3]
    if h % 2 or w % 2:
        raise ValueError('Dataset sheet dimensions must divide into two equal rows and columns.')
    return [image[:, y:y+h//2, x:x+w//2].detach().cpu().clone()
            for y in (0,h//2) for x in (0,w//2)]

def run(node, api, parameters, views, width, height):
    from comfy.model_management import throw_exception_if_processing_interrupted
    width, height = int(width), int(height)
    if width < 256 or height <= width or width % 64 or height % 64 or width*height > 4*1024*1024:
        raise ValueError('Dataset images must be portrait, multiples of 64, and at most 4 megapixels. Try 1152 × 2048.')
    if views not in ('both','portraits','full_body'):
        raise ValueError('Unknown dataset view set.')
    refs = api._active_refs(parameters['refs_data'], 'refmod_dataset')
    if not refs or not refs[0]:
        raise ValueError('Upload the character or character sheet to Ref 1 first.')
    try:
        state = json.loads(parameters['state_json'] or '{}')
    except (ValueError, TypeError):
        state = {}
    action = state.get('action') or {}
    owner = str(parameters['unique_id'])
    source = api._load_ref_image(refs[0])
    signature = hashlib.sha256(source.cpu().numpy().tobytes()).hexdigest()
    signature += json.dumps([views, parameters['prompt'], state.get('session_id')])
    base = {k:parameters[k] for k in ('model','clip','vae','aspect_ratio','megapixels','multiple',
        'reference_resolution','negative_prompt','cfg','sampler_name','scheduler','steps','cache_device','cache_dtype')}
    base.update(refs=refs, custom_size=True)
    prompts = json.loads(Path(__file__).with_name('dataset_prompts.json').read_text(encoding='utf-8'))
    if action.get('type') in ('dataset_finish', 'dataset_output_originals'):
        session = SESSIONS.get(owner)
        if not session or action.get('dataset_id') != session['id']:
            raise ValueError('Dataset preview expired. Generate the views again before enhancing.')
        if session['signature'] != signature:
            raise ValueError('The character, view set or instructions changed. Generate the views again first.')
        selected = action.get('selected')
        if not isinstance(selected,list) or not selected or any(type(i) is not int or i<0 or i>=len(session['crops']) for i in selected) or len(set(selected))!=len(selected):
            raise ValueError('Select at least one valid dataset view to enhance.')
        if action.get('type') == 'dataset_output_originals':
            images = [session['crops'][i] for i in selected]
            actual_height, actual_width = images[0].shape[1:3]
            return {'ui': {'mquwen21_dataset': [{'id': session['id'],
                    'labels': [session['labels'][i] for i in selected],
                    'images': [api._preview_ui_image(im) for im in images],
                    'complete': True, 'unenhanced': True, 'width': actual_width, 'height': actual_height}]},
                    'result': (torch.cat(images), api.ExecutionBlocker(None), api.ExecutionBlocker(None),
                               'Original generated dataset views; no enhancement applied.', source)}
        images=[]; compiled=[]
        for position,index in enumerate(selected):
            throw_exception_if_processing_interrupted()
            label=session['labels'][index]
            logging.info('[Muse Qwen Dataset] Enhance %d/%d: %s; output %dx%d', position+1,len(selected),label,width,height)
            image,positive,negative,text = node._run_pipeline(**base,
                image_1_override=session['crops'][index],edit_text=prompts['enhance'],
                size_override=(width,height),seed=(session['seed']+index+2) % 2**64)
            if tuple(image.shape[1:3]) != (height,width):
                raise ValueError('Dataset enhancer returned unexpected image dimensions.')
            images.append(image.detach().cpu()); compiled.append(label+'\n'+text)
        batch=torch.cat(images)
        return {'ui':{'mquwen21_dataset':[{'id':session['id'],'labels':[session['labels'][i] for i in selected],
                    'images':[api._preview_ui_image(im) for im in images], 'complete':True,'width':width,'height':height}]},
                'result':(batch,api.ExecutionBlocker(None),api.ExecutionBlocker(None),'\n\n'.join(compiled),source)}
    crops=[]; labels=[]; compiled=[]
    for group in (('portraits','full_body') if views=='both' else (views,)):
        throw_exception_if_processing_interrupted()
        logging.info('[Muse Qwen Dataset] Generate %s sheet at %dx%d',group,width,height)
        instruction=prompts[group]
        if parameters['prompt'].strip(): instruction+='\n\nAdditional character instructions: '+parameters['prompt'].strip()
        image,_,_,text=node._run_pipeline(**base,image_1_override=source,edit_text=instruction,
            size_override=(width,height),seed=(int(parameters['seed'])+len(crops)//4) % 2**64)
        crops.extend(split_grid(image)); labels.extend(LABELS[group]); compiled.append(text)
    session={'id':uuid.uuid4().hex,'signature':signature,'seed':int(parameters['seed']),'crops':crops,'labels':labels}
    SESSIONS[owner]=session; SESSIONS.move_to_end(owner)
    while len(SESSIONS)>2: SESSIONS.popitem(last=False)
    return {'ui':{'mquwen21_dataset':[{'id':session['id'],'labels':labels,
                    'images':[api._preview_ui_image(im) for im in crops],'complete':False,'width':width,'height':height}]},
            'result':(api.ExecutionBlocker(None),api.ExecutionBlocker(None),api.ExecutionBlocker(None),'\n\n'.join(compiled),source)}
