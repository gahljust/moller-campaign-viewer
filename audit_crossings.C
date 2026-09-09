// Read-only audit: physical-volume entry records, backsplash, and independently
// accumulated main-detector history moments. Never changes production scores.
#include "../acceptance_strata/analyze_neyman_batch.C"
#include <tuple>

namespace crossing_audit {
struct Plane {double x,y,z,d;int face;};
struct Scalar {long double sum=0,square=0,maximum=0;long long count=0;void add(long double x){sum+=x;square+=x*x;maximum=std::max(maximum,x);if(x)++count;}};
struct Stratum {long long entries=0,nonzero=0;std::vector<long double> sum,cross;std::map<std::string,Scalar> metrics;};
}

void audit_crossings(const char* root_path,const char* plan_path,const char* geometry_path,
                     const char* output_path,const char* channel,const char* response_path,long long expected_entries) {
  using namespace crossing_audit;
  if(!load_fits(response_path))throw std::runtime_error("Missing PE response");
  neyman_batch::Plan plan;if(!plan.load(plan_path))throw std::runtime_error("Invalid plan");
  std::map<int,std::vector<Plane>> planes;
  {std::ifstream in(geometry_path);int det,face;double x,y,z,d;while(in>>det>>face>>x>>y>>z>>d)planes[det].push_back({x,y,z,d,face});}
  TFile input(root_path,"READ");auto* tree=dynamic_cast<TTree*>(input.Get("T"));
  if(!tree)throw std::runtime_error("Missing tree");
  long long entries=tree->GetEntries();bool compact=entries==plan.transports();
  if(!compact&&entries!=expected_entries)throw std::runtime_error("Wrong entry count");
  tree->SetBranchStatus("*",0);for(const char* b:{"hit*","part*","rate","ev*","W2"})tree->SetBranchStatus(b,1);
  double rate=0;remollEvent_t* ev=nullptr;
  std::vector<remollGenericDetectorHit_t>* hits=nullptr;std::vector<remollEventParticle_t>* parts=nullptr;
  tree->SetBranchAddress("rate",&rate);tree->SetBranchAddress("ev",&ev);tree->SetBranchAddress("hit",&hits);tree->SetBranchAddress("part",&parts);
  int components=std::string(channel)=="ep_inelastic"?3:1,dimensions=components*18;
  std::map<int,Stratum> strata;
  for(auto [g,p]:plan.group){strata[g].sum.resize(dimensions);strata[g].cross.resize(dimensions*dimensions);}
  std::map<std::string,long double> volumes;
  std::map<std::string,long long> counts;
  std::vector<std::string> metrics={"main_entries","main_backward","main_reentries","main_after_showermax",
      "main_off_boundary","main_outward_state","main_side_entry","main_exact_duplicates",
      "shower_forward","shower_backward","shower_reentries","shower_reverse_same_track","shower_exact_duplicates",
      "main_neutral","main_charged_below_cherenkov","shower_forward_pe","shower_duplicate_forward_pe",
      "shower_duplicate_changed_state","shower_duplicate_forward"};
  for(long long i=0;i<entries;++i) {
    tree->GetEntry(i);if(!ev||!hits||!parts||!std::isfinite(rate)||rate<0)throw std::runtime_error("Invalid event");
    auto* e=universal_gate_scan::selected_electron(*parts);
    int g=plan.stratum(e?e->p:-1,e?std::atan2(std::hypot(e->px,e->py),e->pz)*1000:-1);
    if(!strata.count(g))throw std::runtime_error("Unmapped stratum");
    auto& s=strata[g];++s.entries;if(rate==0)continue;
    if(++s.nonzero>plan.group.at(g).quota)throw std::runtime_error("Quota exceeded");
    int c=0;
    if(components==3){double w=ev->W2>0?std::sqrt(ev->W2)*.001:-1;c=w>=1&&w<1.4?0:w>=1.4&&w<2.5?1:w>=2.5&&w<6?2:-1;}
    std::vector<long double> score(dimensions);std::map<std::string,long double> event_metrics;
    std::vector<const remollGenericDetectorHit_t*> ordered;
    for(const auto& h:*hits)if(ring_index(h.det)>=0||(h.det>=73001&&h.det<=73028))ordered.push_back(&h);
    std::stable_sort(ordered.begin(),ordered.end(),[](auto a,auto b){return a->t<b->t;});
    std::map<std::tuple<int,int,int>,const remollGenericDetectorHit_t*> previous;
    std::map<int,double> shower_time;
    std::map<std::tuple<int,int,int>,bool> shower_forward;
    for(auto ptr:ordered) {
      const auto& h=*ptr;auto key=std::make_tuple(h.det,h.id,h.trid);auto prev=previous.find(key);
      bool repeated=prev!=previous.end(),duplicate=repeated&&h.t==prev->second->t&&h.x==prev->second->x&&h.y==prev->second->y&&h.z==prev->second->z;
      auto add=[&](const std::string& key){event_metrics[key]+=rate;++counts[key];};
      int ring=ring_index(h.det);
      if(ring>=0&&ring<6) {
        add("main_entries");if(h.pz<0){add("main_backward");volumes[std::string(h.creator_physvol_name)]+=rate;}
        if(repeated)add("main_reentries");if(duplicate)add("main_exact_duplicates");
        if(h.pz<0&&shower_time.count(h.trid)&&shower_time[h.trid]<h.t)add("main_after_showermax");
        if(h.pid==22||h.pid==2112)add("main_neutral");
        if((std::abs(h.pid)==11||std::abs(h.pid)==13||std::abs(h.pid)==211)&&h.beta<=1/1.46)add("main_charged_below_cherenkov");
        if(!planes.count(h.det))throw std::runtime_error("Missing quartz shape");
        double nearest=1e100;const Plane* face=nullptr;
        for(const auto& p:planes[h.det]){double distance=std::abs(p.x*h.xl+p.y*h.yl+p.z*h.zl-p.d);if(distance<nearest){nearest=distance;face=&p;}}
        if(nearest>1e-4)add("main_off_boundary");
        else {
          if(face->face>=2)add("main_side_entry");
          if(face->x*h.pxl+face->y*h.pyl+face->z*h.pzl>1e-9*std::max(1.,h.p))add("main_outward_state");
        }
        if(c>=0){
          // Independently express the established seven-sector region rule.
          double phi=std::atan2(h.y,h.x);if(phi<0)phi+=2*std::acos(-1.);
          double u=std::fmod(phi,2*std::acos(-1.)/7)/(std::acos(-1.)/28);
          int region=u<1||u>=7?0:u<3||u>=5?1:2;
          score[c*18+ring*3+region]+=rate;
        }
      } else {
        if(h.pz>0){add("shower_forward");shower_forward[key]=true;}
        if(h.pz<0){add("shower_backward");if(shower_forward[key])add("shower_reverse_same_track");}
        if(repeated)add("shower_reentries");if(duplicate){
          add("shower_exact_duplicates");
          if(h.pz>0)add("shower_duplicate_forward");
          const auto& old=*prev->second;
          if(h.px!=old.px||h.py!=old.py||h.pz!=old.pz||h.e!=old.e||h.pid!=old.pid)add("shower_duplicate_changed_state");
        }
        if(h.pz>0&&response_energy_available(h.pid,h.e)) {
          double pe=rate*response(h.det,h.pid,h.e,h.x,h.y);
          if(!std::isfinite(pe)||pe<0)throw std::runtime_error("Invalid PE score");
          event_metrics["shower_forward_pe"]+=pe;
          if(pe)++counts["shower_forward_pe"];
          if(duplicate){event_metrics["shower_duplicate_forward_pe"]+=pe;if(pe)++counts["shower_duplicate_forward_pe"];}
        }
        shower_time[h.trid]=h.t;
      }
      previous[key]=ptr;
    }
    std::vector<int> nonzero;for(int j=0;j<dimensions;++j)if(score[j]){s.sum[j]+=score[j];nonzero.push_back(j);}
    for(int a:nonzero)for(int b:nonzero)s.cross[a*dimensions+b]+=score[a]*score[b];
    for(const auto& key:metrics)s.metrics[key].add(event_metrics[key]);
  }
  for(auto [g,p]:plan.group)if((compact&&strata[g].entries!=p.quota)||(!compact&&strata[g].entries<p.quota))throw std::runtime_error("Incomplete quota");
  std::ofstream out(output_path);out<<std::setprecision(18)<<"kind\tkey\tleft\tright\tvalue\tvariance\tmaximum\tcount\n";
  for(const auto& key:metrics){long double mean=0,var=0,mx=0;for(auto [g,p]:plan.group){auto a=strata[g].metrics[key];long double n=p.quota;mean+=a.sum;var+=n/(n-1)*(a.square-a.sum*a.sum/n);mx=std::max(mx,a.maximum);}out<<"metric\t"<<key<<"\t0\t0\t"<<double(mean)<<'\t'<<double(var)<<'\t'<<double(mx)<<'\t'<<counts[key]<<'\n';}
  for(int a=0;a<dimensions;++a){long double mean=0;for(auto [g,p]:plan.group)mean+=strata[g].sum[a];out<<"mean\tmain\t"<<a<<"\t0\t"<<double(mean)<<"\t0\t0\t0\n";
    for(int b=0;b<dimensions;++b){long double cov=0;for(auto [g,p]:plan.group){auto& s=strata[g];long double n=p.quota;cov+=n/(n-1)*(s.cross[a*dimensions+b]-s.sum[a]*s.sum[b]/n);}out<<"covariance\tmain\t"<<a<<'\t'<<b<<'\t'<<double(cov)<<"\t0\t0\t0\n";}}
  for(const auto& item:volumes){std::string name=item.first;auto value=item.second;std::replace(name.begin(),name.end(),'\t',' ');out<<"volume\t"<<name<<"\t0\t0\t"<<double(value)<<"\t0\t0\t0\n";}
  if(!out)throw std::runtime_error("Cannot write audit");std::cout<<"CROSSING_AUDIT_OK "<<entries<<std::endl;
}
