/**
 * Supabase 数据层适配器
 * 用于替换 localStorage 实现数据持久化
 */

const SUPABASE_URL = 'https://myfgadrghcodwswfjdwe.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15ZmdhZHJnaGNvZHdzd2ZqZHdlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE0MDI0MjIsImV4cCI6MjA3Njk3ODQyMn0.YAqQGp5rnMZJ9DOhAn7qBGKH81pE1ut9GWUTtFcFop0';

// 初始化 Supabase 客户端
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/**
 * Supabase 数据层 (替换原 localStorage LS 对象)
 * 注意：DB 变量在 1.html 中定义，这里不需要重复定义
 */
const LS = {
  /**
   * 获取数据
   * @param {string} key - 键名 (对应表名或settings的key)
   * @param {*} defaultValue - 默认值
   */
  async get(key, defaultValue = null) {
    try {
      // settings 表的特殊处理
      if (['hj_announce', 'hj_contract_template', 'hj_signature_text'].includes(key)) {
        const { data, error } = await supabase
          .from('settings')
          .select('value')
          .eq('key', key)
          .single();
        
        if (error) {
          if (error.code === 'PGRST116') return defaultValue; // 未找到记录
          throw error;
        }
        return data ? data.value : defaultValue;
      }
      
      // 普通表查询
      const tableName = this._getTableName(key);
      const { data, error } = await supabase
        .from(tableName)
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data || defaultValue;
      
    } catch (err) {
      console.error(`[LS.get] 读取失败 ${key}:`, err);
      return defaultValue;
    }
  },

  /**
   * 保存数据
   * @param {string} key - 键名
   * @param {*} value - 值
   */
  async set(key, value) {
    try {
      // settings 表的特殊处理
      if (['hj_announce', 'hj_contract_template', 'hj_signature_text'].includes(key)) {
        const { error } = await supabase
          .from('settings')
          .upsert({
            key: key,
            value: value,
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'key'
          });
        
        if (error) throw error;
        return;
      }
      
      // 普通表：删除所有旧数据，插入新数据
      const tableName = this._getTableName(key);
      
      // 转换数据格式
      const records = this._transformForInsert(tableName, value);
      
      // 先删除现有数据（如果需要完全替换）
      // 注意：这里为了简化，采用完全替换策略
      // 实际生产环境可能需要更精细的增量更新
      const { error: deleteError } = await supabase
        .from(tableName)
        .delete()
        .neq('id', '__impossible_id__'); // 删除所有
      
      // 插入新数据
      if (records && records.length > 0) {
        const { error: insertError } = await supabase
          .from(tableName)
          .insert(records);
        
        if (insertError) throw insertError;
      }
      
    } catch (err) {
      console.error(`[LS.set] 保存失败 ${key}:`, err);
      throw err;
    }
  },

  /**
   * 删除数据
   * @param {string} key - 键名
   */
  async del(key) {
    try {
      if (['hj_announce', 'hj_contract_template', 'hj_signature_text'].includes(key)) {
        await supabase.from('settings').delete().eq('key', key);
      } else {
        const tableName = this._getTableName(key);
        await supabase.from(tableName).delete().neq('id', '__impossible_id__');
      }
    } catch (err) {
      console.error(`[LS.del] 删除失败 ${key}:`, err);
    }
  },

  /**
   * 获取表名
   */
  _getTableName(key) {
    const map = {
      'hj_listings': 'listings',
      'hj_tenants': 'tenants',
      'hj_orders': 'orders',
      'hj_contracts': 'contracts'
    };
    return map[key] || key;
  },

  /**
   * 转换数据格式以匹配数据库表结构
   */
  _transformForInsert(tableName, data) {
    if (!Array.isArray(data)) return [];
    
    switch (tableName) {
      case 'listings':
        return data.map(item => ({
          id: item.id,
          title: item.title,
          category: item.category,
          price: item.price,
          layout: item.layout,
          img: item.img,
          status: item.status || 'available'
        }));
        
      case 'tenants':
        return data.map(item => ({
          id: item.id,
          user_name: item.user,
          gender: item.gender,
          phone: item.phone,
          house: item.house,
          price: item.price,
          idcard: item.idcard,
          start_date: item.start,
          end_date: item.end,
          stars: item.stars || 0
        }));
        
      case 'orders':
        return data.map(item => ({
          id: item.id,
          type: item.type,
          name: item.name,
          phone: item.phone,
          house: item.house,
          time: item.time,
          content: item.content,
          status: item.status
        }));
        
      case 'contracts':
        return data.map(item => ({
          id: item.id,
          contract_no: item.no,
          tenant_name: item.name,
          idcard: item.idcard,
          house: item.house,
          period: item.period
        }));
        
      default:
        return data;
    }
  },

  /**
   * 从数据库格式转换回应用格式
   */
  _transformFromDB(tableName, data) {
    if (!Array.isArray(data)) return data;
    
    switch (tableName) {
      case 'tenants':
        return data.map(item => ({
          id: item.id,
          user: item.user_name,
          gender: item.gender,
          phone: item.phone,
          house: item.house,
          price: item.price,
          idcard: item.idcard,
          start: item.start_date,
          end: item.end_date,
          stars: item.stars,
          ts: new Date(item.created_at).getTime()
        }));
        
      case 'contracts':
        return data.map(item => ({
          id: item.id,
          no: item.contract_no,
          name: item.tenant_name,
          idcard: item.idcard,
          house: item.house,
          period: item.period,
          ts: new Date(item.created_at).getTime()
        }));
        
      case 'listings':
      case 'orders':
      default:
        return data.map(item => ({
          ...item,
          ts: item.created_at ? new Date(item.created_at).getTime() : Date.now()
        }));
    }
  }
};

// 改进的 get 方法，自动转换格式
const originalGet = LS.get;
LS.get = async function(key, defaultValue = null) {
  const data = await originalGet.call(this, key, defaultValue);
  const tableName = this._getTableName(key);
  
  if (Array.isArray(data) && ['listings', 'tenants', 'orders', 'contracts'].includes(tableName)) {
    return this._transformFromDB(tableName, data);
  }
  
  return data;
};

console.log('✅ Supabase 数据层适配器已加载');

