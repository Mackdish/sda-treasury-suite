ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  is_first boolean;
  ch_id uuid;
BEGIN
  SELECT NOT EXISTS (SELECT 1 FROM public.profiles) INTO is_first;
  SELECT id INTO ch_id FROM public.churches ORDER BY created_at LIMIT 1;

  INSERT INTO public.profiles (id, full_name, email, primary_church_id, is_active, approval_status, approved_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.email,
    CASE WHEN is_first THEN ch_id ELSE NULL END,
    true,
    CASE WHEN is_first THEN 'approved' ELSE 'pending' END,
    CASE WHEN is_first THEN now() ELSE NULL END
  )
  ON CONFLICT (id) DO NOTHING;

  IF is_first THEN
    INSERT INTO public.user_roles (user_id, role, church_id)
    VALUES (NEW.id, 'admin', ch_id)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Self-heal for users created before the trigger existed.
CREATE OR REPLACE FUNCTION public.ensure_my_profile()
RETURNS TABLE (approval_status text, is_active boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  uid uuid := auth.uid();
  is_first boolean;
  ch_id uuid;
  em text;
  nm text;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = uid) THEN
    SELECT NOT EXISTS (SELECT 1 FROM public.profiles) INTO is_first;
    SELECT id INTO ch_id FROM public.churches ORDER BY created_at LIMIT 1;
    SELECT u.email, COALESCE(u.raw_user_meta_data->>'full_name', u.email)
      INTO em, nm FROM auth.users u WHERE u.id = uid;

    INSERT INTO public.profiles (id, full_name, email, primary_church_id, is_active, approval_status, approved_at)
    VALUES (uid, nm, em, CASE WHEN is_first THEN ch_id ELSE NULL END, true,
            CASE WHEN is_first THEN 'approved' ELSE 'pending' END,
            CASE WHEN is_first THEN now() ELSE NULL END)
    ON CONFLICT (id) DO NOTHING;

    IF is_first THEN
      INSERT INTO public.user_roles (user_id, role, church_id)
      VALUES (uid, 'admin', ch_id) ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  RETURN QUERY SELECT p.approval_status, p.is_active FROM public.profiles p WHERE p.id = uid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_my_profile() TO authenticated;

-- Default church, categories, departments and settings so the system works out of the box.
INSERT INTO public.churches (name, code, country, currency)
SELECT 'Seventh-day Adventist Church', 'SDA-001', 'Kenya', 'KES'
WHERE NOT EXISTS (SELECT 1 FROM public.churches);

INSERT INTO public.offering_categories (church_id, name, code, fund_type, conference_split_pct, sort_order)
SELECT c.id, v.name, v.code, v.fund::fund_type, v.pct, v.ord
FROM public.churches c
CROSS JOIN (VALUES
  ('Tithe','TITHE','trust',100,10),
  ('Combined Offering','COMB','local',50,20),
  ('Camp Goal','CAMPGOAL','camp',50,30),
  ('Thanksgiving','THANKS','local',50,40),
  ('First Fruit','FIRSTFRUIT','local',50,50),
  ('Special Offering','SPECIAL','local',50,60),
  ('13th Sabbath','THIRTEENTH','trust',100,70),
  ('Camp Expense','CAMPEXP','camp',0,80),
  ('Camp Food','CAMPFOOD','camp',0,90),
  ('Development','DEV','local',0,100)
) AS v(name, code, fund, pct, ord)
WHERE c.id = (SELECT id FROM public.churches ORDER BY created_at LIMIT 1)
  AND NOT EXISTS (SELECT 1 FROM public.offering_categories);

INSERT INTO public.departments (church_id, name, code, sort_order)
SELECT c.id, v.name, v.code, v.ord
FROM public.churches c
CROSS JOIN (VALUES
  ('Sabbath School','SS',10),
  ('Personal Ministries','PM',20),
  ('Youth (AY)','AY',30),
  ('Children Ministries','CHM',40),
  ('Women Ministries','WM',50),
  ('Music','MUS',60),
  ('Health Ministries','HM',70),
  ('Development','DEV',80)
) AS v(name, code, ord)
WHERE c.id = (SELECT id FROM public.churches ORDER BY created_at LIMIT 1)
  AND NOT EXISTS (SELECT 1 FROM public.departments);

INSERT INTO public.site_settings (church_id, system_name, tagline, marquee_enabled, marquee_speed)
SELECT c.id, 'Church Treasury System', 'Seventh-day Adventist Church', true, 40
FROM public.churches c
WHERE c.id = (SELECT id FROM public.churches ORDER BY created_at LIMIT 1)
  AND NOT EXISTS (SELECT 1 FROM public.site_settings);