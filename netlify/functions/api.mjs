import sharp from 'sharp';
import templates from '../../server/templates.json' with {type:'json'};
import { store } from '../../server/http.mjs';
import { settings } from '../../server/security.mjs';
import { fail } from '../../server/model.mjs';
import { createApi } from '../../server/api.mjs';
export default createApi({templates, store, configFor: settings, processImage: async input => {
  try {
    const image=sharp(input,{limitInputPixels:25000000,animated:false});
    const meta=await image.metadata();
    if(!['jpeg','png','webp'].includes(meta.format))fail(400,'Gebruik een JPG, PNG of WebP.');
    return await image.rotate().resize({width:2400,height:2400,fit:'inside',withoutEnlargement:true}).webp({quality:85}).toBuffer();
  } catch { fail(400,'Deze foto kan niet worden verwerkt. Gebruik een JPG, PNG of WebP van maximaal 25 megapixels.'); }
}});
